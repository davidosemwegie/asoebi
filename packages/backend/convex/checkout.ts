import { ConvexError, v } from "convex/values"
import type { FunctionReference } from "convex/server"

import { createNotification } from "./notifications"
import {
  MAX_ORDER_LINES,
  REQUEST_RECEIPT_TTL,
  adjustReservations,
  appendOrderHistory,
  buildOrderSnapshot,
  digestPayload,
  getCurrentUser,
  releaseReservation,
  requireAttendeeForEvent,
  requireOpenEvent,
  requireVerifiedEmail,
  normalizeLines,
  validateRequestId,
  type FulfillmentInput,
  type OrderLineInput,
} from "./orderModel"
import { authComponent } from "./auth"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  env,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server"

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/
const PROOF_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"])
const MAX_PROOF_BYTES = 10 * 1024 * 1024
const CLAIM_TTL = 15 * 60 * 1_000
const internalCheckout = internal as unknown as {
  checkout: {
    afterSubmit: FunctionReference<
      "mutation",
      "internal",
      { orderId: Id<"orders"> },
      null
    >
    afterCancellation: FunctionReference<
      "mutation",
      "internal",
      { orderId: Id<"orders"> },
      null
    >
    cleanExpiredOrderArtifacts: FunctionReference<
      "mutation",
      "internal",
      Record<string, never>,
      { claims: number; receipts: number }
    >
  }
}
const internalAuth = internal as unknown as {
  auth: {
    getUserForNotification: FunctionReference<
      "query",
      "internal",
      { userId: string },
      { name: string; email: string } | null
    >
  }
}

const lineInput = v.object({ itemId: v.id("items"), quantity: v.number() })
const fulfillmentInput = v.object({
  optionId: v.id("fulfillmentOptions"),
  pickupContact: v.optional(v.string()),
  recipientName: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
  address: v.optional(v.string()),
  availability: v.optional(v.string()),
  notes: v.optional(v.string()),
})
const guestInput = {
  guestName: v.string(),
  guestPhone: v.optional(v.string()),
}

async function getEventForAttendee(ctx: MutationCtx, shareToken: string) {
  if (!SHARE_TOKEN_PATTERN.test(shareToken))
    throw new ConvexError("This event link is not available.")
  const event = await ctx.db
    .query("events")
    .withIndex("by_shareToken", (q) => q.eq("shareToken", shareToken))
    .unique()
  if (!event) throw new ConvexError("This event link is not available.")
  const access = await requireAttendeeForEvent(ctx, event._id)
  return { event, ...access }
}

async function getExistingLines(ctx: MutationCtx, orderId: Id<"orders">) {
  return await ctx.db
    .query("orderLines")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .take(MAX_ORDER_LINES)
}

function reference() {
  const suffix = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase()
  return `ASO-${Date.now().toString(36).toUpperCase()}-${suffix}`
}

function searchText(order: {
  reference: string
  guestName?: string
  guestEmail?: string
}) {
  return [order.reference, order.guestName, order.guestEmail]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

async function writeLines(
  ctx: MutationCtx,
  order: Doc<"orders">,
  oldLines: Doc<"orderLines">[],
  lines: Awaited<ReturnType<typeof buildOrderSnapshot>>["lines"]
) {
  for (const line of oldLines) await ctx.db.delete(line._id)
  const now = Date.now()
  for (const line of lines) {
    await ctx.db.insert("orderLines", {
      ...line,
      eventId: order.eventId,
      orderId: order._id,
      currency: order.currency ?? "",
      paymentStatus: order.paymentStatus,
      progress: order.progress,
      fulfillmentOptionId: order.fulfillmentOptionId,
      searchText: `${order.reference} ${line.itemName}`.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    })
  }
}

async function patchLineProjections(ctx: MutationCtx, order: Doc<"orders">) {
  const lines = await getExistingLines(ctx, order._id)
  for (const line of lines) {
    await ctx.db.patch(line._id, {
      paymentStatus: order.paymentStatus,
      progress: order.progress,
      fulfillmentOptionId: order.fulfillmentOptionId,
      updatedAt: Date.now(),
    })
  }
}

async function requireProof(
  ctx: MutationCtx,
  args: {
    proofId: Id<"paymentProofs">
    eventId: Id<"events">
    attendeeId: Id<"eventAttendees">
    orderId: Id<"orders">
    allowCurrent?: boolean
  }
) {
  const proof = await ctx.db.get(args.proofId)
  if (
    !proof ||
    proof.eventId !== args.eventId ||
    proof.attendeeId !== args.attendeeId ||
    proof.status !== "active" ||
    (proof.orderId !== undefined &&
      (proof.orderId !== args.orderId || !args.allowCurrent))
  ) {
    throw new ConvexError("Upload a valid payment receipt before submitting.")
  }
  return proof
}

async function checkReceipt(
  ctx: MutationCtx,
  attendeeId: Id<"eventAttendees">,
  requestId: string,
  action: "submit" | "update_pending" | "resubmit_rejected" | "cancel",
  payload: unknown
) {
  validateRequestId(requestId)
  const payloadHash = await digestPayload(payload)
  const receipt = await ctx.db
    .query("orderRequestReceipts")
    .withIndex("by_attendeeId_and_requestId", (q) =>
      q.eq("attendeeId", attendeeId).eq("requestId", requestId)
    )
    .unique()
  if (!receipt) return { payloadHash, replay: null }
  if (receipt.action !== action || receipt.payloadHash !== payloadHash) {
    throw new ConvexError(
      "This request ID was already used for a different change."
    )
  }
  return { payloadHash, replay: receipt.resultOrderId }
}

async function storeReceipt(
  ctx: MutationCtx,
  args: {
    attendeeId: Id<"eventAttendees">
    orderId: Id<"orders">
    requestId: string
    action: "submit" | "update_pending" | "resubmit_rejected" | "cancel"
    payloadHash: string
  }
) {
  await ctx.db.insert("orderRequestReceipts", {
    ...args,
    resultOrderId: args.orderId,
    createdAt: Date.now(),
    expiresAt: Date.now() + REQUEST_RECEIPT_TTL,
  })
}

async function createDraft(
  ctx: MutationCtx,
  args: {
    event: Doc<"events">
    attendeeId: Id<"eventAttendees">
    userId: string
  }
) {
  const now = Date.now()
  const orderId = await ctx.db.insert("orders", {
    eventId: args.event._id,
    attendeeId: args.attendeeId,
    userId: args.userId,
    reference: reference(),
    lifecycle: "draft",
    paymentStatus: "not_submitted",
    progress: "pending",
    reservationState: "none",
    itemSubtotalMinor: 0,
    fulfillmentFeeMinor: 0,
    totalMinor: 0,
    proofRequired: false,
    searchText: "",
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.patch(args.attendeeId, {
    activeOrderId: orderId,
    updatedAt: now,
  })
  const order = await ctx.db.get(orderId)
  if (!order) throw new Error("Draft order could not be created.")
  return order
}

async function activeOrder(ctx: MutationCtx, attendee: Doc<"eventAttendees">) {
  if (!attendee.activeOrderId) return null
  const order = await ctx.db.get(attendee.activeOrderId)
  if (
    !order ||
    order.attendeeId !== attendee._id ||
    order.lifecycle === "cancelled"
  ) {
    return null
  }
  return order
}

export const get = query({
  args: { shareToken: v.string() },
  returns: v.any(),
  handler: async (ctx, { shareToken }) => {
    const user = await authComponent.getAuthUser(ctx)
    if (!SHARE_TOKEN_PATTERN.test(shareToken)) return null
    const event = await ctx.db
      .query("events")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", shareToken))
      .unique()
    if (!event) return null
    const attendee = await ctx.db
      .query("eventAttendees")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", event._id).eq("userId", user._id)
      )
      .unique()
    if (!attendee) return null
    const order = attendee.activeOrderId
      ? await ctx.db.get(attendee.activeOrderId)
      : null
    const [items, options, paymentInstructions, lines] = await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_eventId_and_isHidden_and_sortOrder", (q) =>
          q.eq("eventId", event._id).eq("isHidden", false)
        )
        .order("asc")
        .take(MAX_ORDER_LINES),
      ctx.db
        .query("fulfillmentOptions")
        .withIndex("by_eventId_and_enabled_and_sortOrder", (q) =>
          q.eq("eventId", event._id).eq("enabled", true)
        )
        .order("asc")
        .take(20),
      ctx.db
        .query("eventPaymentInstructions")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .unique(),
      order
        ? ctx.db
            .query("orderLines")
            .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
            .take(MAX_ORDER_LINES)
        : [],
    ])
    // Only a live reservation should be added back for the attendee editing it.
    // Draft and rejected orders intentionally reserve no inventory.
    const retainedQuantities = new Map(
      order?.reservationState === "reserved"
        ? lines.map((line) => [line.itemId, line.quantity])
        : []
    )
    return {
      event: {
        name: event.name,
        currency: event.currency,
        orderingOpen:
          event.status === "published" &&
          (event.orderDeadlineAt ?? 0) > Date.now(),
      },
      attendee: {
        email: user.email,
        emailVerified: user.emailVerified === true,
      },
      items: items.map((item) => ({
        _id: item._id,
        name: item.name,
        description: item.description,
        unitLabel: item.unitLabel,
        priceMinor: item.priceMinor,
        availableQuantity: Math.max(
          0,
          item.inventoryTotal -
            item.reservedQuantity +
            (retainedQuantities.get(item._id) ?? 0)
        ),
      })),
      fulfillmentOptions: options,
      paymentInstructions: paymentInstructions?.instructions ?? null,
      order: order
        ? {
            ...order,
            currentProofId: order.currentProofId ?? null,
            fulfillmentDetails: order.fulfillmentDetails ?? null,
          }
        : null,
      lines,
    }
  },
})

export const saveDraft = mutation({
  args: {
    shareToken: v.string(),
    lines: v.array(lineInput),
    fulfillment: v.optional(fulfillmentInput),
    guestName: v.optional(v.string()),
    guestPhone: v.optional(v.string()),
    reviewed: v.optional(v.boolean()),
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const { event, attendee, user } = await getEventForAttendee(
      ctx,
      args.shareToken
    )
    requireOpenEvent(event)
    let order = await activeOrder(ctx, attendee)
    if (order && order.lifecycle !== "draft")
      throw new ConvexError("This order is already submitted.")
    if (!order)
      order = await createDraft(ctx, {
        event,
        attendeeId: attendee._id,
        userId: user._id,
      })
    const oldLines = await getExistingLines(ctx, order._id)
    if (args.lines.length === 0) {
      for (const line of oldLines) await ctx.db.delete(line._id)
      await ctx.db.patch(order._id, {
        itemSubtotalMinor: 0,
        fulfillmentFeeMinor: 0,
        totalMinor: 0,
        guestName: args.guestName?.trim() || undefined,
        guestPhone: args.guestPhone?.trim() || undefined,
        reviewedAt: args.reviewed ? Date.now() : undefined,
        proofRequired: false,
        updatedAt: Date.now(),
      })
      return order._id
    }
    if (!args.fulfillment) {
      const quantities = normalizeLines(args.lines as OrderLineInput[])
      const previousByItem = new Map(
        oldLines.map((line) => [line.itemId, line])
      )
      const draftLines: Awaited<
        ReturnType<typeof buildOrderSnapshot>
      >["lines"] = []
      for (const [itemId, quantity] of quantities) {
        const item = await ctx.db.get(itemId)
        if (!item || item.eventId !== event._id || item.isHidden)
          throw new ConvexError(
            "One of the selected items is no longer available."
          )
        const prior = previousByItem.get(itemId)
        const unitPriceMinor = prior?.unitPriceMinor ?? item.priceMinor
        const lineTotalMinor = unitPriceMinor * quantity
        if (!Number.isSafeInteger(lineTotalMinor))
          throw new ConvexError("Order total is too large.")
        draftLines.push({
          itemId,
          itemName: prior?.itemName ?? item.name,
          itemDescription: prior?.itemDescription ?? item.description,
          unitLabel: prior?.unitLabel ?? item.unitLabel,
          quantity,
          unitPriceMinor,
          lineTotalMinor,
        })
      }
      const itemSubtotalMinor = draftLines.reduce(
        (total, line) => total + line.lineTotalMinor,
        0
      )
      if (!Number.isSafeInteger(itemSubtotalMinor))
        throw new ConvexError("Order total is too large.")
      await ctx.db.patch(order._id, {
        itemSubtotalMinor,
        totalMinor: itemSubtotalMinor,
        fulfillmentFeeMinor: 0,
        guestName: args.guestName?.trim() || undefined,
        guestPhone: args.guestPhone?.trim() || undefined,
        reviewedAt: args.reviewed ? Date.now() : undefined,
        proofRequired: false,
        updatedAt: Date.now(),
      })
      const updated = await ctx.db.get(order._id)
      if (!updated) throw new Error("Draft order could not be saved.")
      await writeLines(ctx, updated, oldLines, draftLines)
      return order._id
    }
    const snapshot = await buildOrderSnapshot(ctx, {
      event,
      lines: args.lines as OrderLineInput[],
      fulfillment: args.fulfillment as FulfillmentInput,
      validateRequired: false,
    })
    const { lines: snapshotLines, ...snapshotOrder } = snapshot
    const patch = {
      ...snapshotOrder,
      currency: event.currency,
      guestName: args.guestName?.trim() || undefined,
      guestPhone: args.guestPhone?.trim() || undefined,
      reviewedAt: args.reviewed ? Date.now() : undefined,
      proofRequired: false,
      updatedAt: Date.now(),
    }
    await ctx.db.patch(order._id, patch)
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Draft order could not be saved.")
    await writeLines(ctx, updated, oldLines, snapshotLines)
    return order._id
  },
})

export const submit = mutation({
  args: {
    shareToken: v.string(),
    requestId: v.string(),
    lines: v.array(lineInput),
    fulfillment: fulfillmentInput,
    proofId: v.id("paymentProofs"),
    ...guestInput,
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const { event, attendee, user } = await getEventForAttendee(
      ctx,
      args.shareToken
    )
    const receipt = await checkReceipt(
      ctx,
      attendee._id,
      args.requestId,
      "submit",
      args
    )
    if (receipt.replay) return receipt.replay
    requireOpenEvent(event)
    requireVerifiedEmail(user)
    let order = await activeOrder(ctx, attendee)
    if (order && order.lifecycle !== "draft")
      throw new ConvexError("You already have an active order for this event.")
    if (!order)
      order = await createDraft(ctx, {
        event,
        attendeeId: attendee._id,
        userId: user._id,
      })
    const oldLines = await getExistingLines(ctx, order._id)
    const snapshot = await buildOrderSnapshot(ctx, {
      event,
      lines: args.lines as OrderLineInput[],
      fulfillment: args.fulfillment as FulfillmentInput,
    })
    const { lines: snapshotLines, ...snapshotOrder } = snapshot
    const proof = await requireProof(ctx, {
      proofId: args.proofId,
      eventId: event._id,
      attendeeId: attendee._id,
      orderId: order._id,
      allowCurrent: args.proofId === order.currentProofId,
    })
    const guestName = args.guestName.trim()
    if (!guestName || guestName.length > 160)
      throw new ConvexError("Enter your name.")
    const guestPhone = args.guestPhone?.trim() || undefined
    if (guestPhone && guestPhone.length > 80)
      throw new ConvexError("Phone number is too long.")
    await adjustReservations(ctx, [], snapshotLines)
    const now = Date.now()
    await ctx.db.patch(order._id, {
      ...snapshotOrder,
      currency: event.currency,
      lifecycle: "submitted",
      paymentStatus: "pending_review",
      progress: "pending",
      reservationState: "reserved",
      guestName,
      guestEmail: user.email.trim().toLowerCase(),
      guestPhone,
      currentProofId: proof._id,
      proofRequired: false,
      submittedAt: now,
      searchText: searchText({
        reference: order.reference,
        guestName,
        guestEmail: user.email,
      }),
      updatedAt: now,
    })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order could not be submitted.")
    await ctx.db.patch(proof._id, { orderId: updated._id })
    await writeLines(ctx, updated, oldLines, snapshotLines)
    await appendOrderHistory(ctx, {
      order,
      actorUserId: user._id,
      actorRole: "guest",
      lifecycle: "submitted",
      paymentStatus: "pending_review",
      progress: "pending",
    })
    await storeReceipt(ctx, {
      attendeeId: attendee._id,
      orderId: updated._id,
      requestId: args.requestId,
      action: "submit",
      payloadHash: receipt.payloadHash,
    })
    await ctx.scheduler.runAfter(0, internalCheckout.checkout.afterSubmit, {
      orderId: updated._id,
    })
    return updated._id
  },
})

export const updatePending = mutation({
  args: {
    shareToken: v.string(),
    requestId: v.string(),
    lines: v.array(lineInput),
    fulfillment: fulfillmentInput,
    proofId: v.optional(v.id("paymentProofs")),
    ...guestInput,
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const { event, attendee, user } = await getEventForAttendee(
      ctx,
      args.shareToken
    )
    const receipt = await checkReceipt(
      ctx,
      attendee._id,
      args.requestId,
      "update_pending",
      args
    )
    if (receipt.replay) return receipt.replay
    requireOpenEvent(event)
    const order = await activeOrder(ctx, attendee)
    if (
      !order ||
      order.lifecycle !== "submitted" ||
      order.paymentStatus !== "pending_review"
    )
      throw new ConvexError(
        "Only an order waiting for payment check can be edited."
      )
    const oldLines = await getExistingLines(ctx, order._id)
    const snapshot = await buildOrderSnapshot(ctx, {
      event,
      lines: args.lines as OrderLineInput[],
      fulfillment: args.fulfillment as FulfillmentInput,
      previousLines: oldLines,
      previousOrder: order,
    })
    const { lines: snapshotLines, ...snapshotOrder } = snapshot
    const totalChanged = snapshot.totalMinor !== order.totalMinor
    const proofId = args.proofId ?? order.currentProofId
    if (!proofId || (totalChanged && args.proofId === undefined))
      throw new ConvexError(
        "Upload a new payment receipt because the total changed."
      )
    if (totalChanged && proofId === order.currentProofId)
      throw new ConvexError(
        "Upload a new payment receipt because the total changed."
      )
    const proof = await requireProof(ctx, {
      proofId,
      eventId: event._id,
      attendeeId: attendee._id,
      orderId: order._id,
      allowCurrent: !totalChanged && proofId === order.currentProofId,
    })
    if (
      totalChanged &&
      order.currentProofId &&
      order.currentProofId !== proof._id
    ) {
      await ctx.db.patch(order.currentProofId, {
        status: "invalidated",
        invalidatedAt: Date.now(),
      })
    }
    await adjustReservations(ctx, oldLines, snapshotLines)
    const guestName = args.guestName.trim()
    if (!guestName || guestName.length > 160)
      throw new ConvexError("Enter your name.")
    await ctx.db.patch(order._id, {
      ...snapshotOrder,
      currency: order.currency ?? event.currency,
      guestName,
      guestPhone: args.guestPhone?.trim() || undefined,
      currentProofId: proof._id,
      proofRequired: false,
      searchText: searchText({
        reference: order.reference,
        guestName,
        guestEmail: order.guestEmail,
      }),
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order could not be updated.")
    await ctx.db.patch(proof._id, { orderId: updated._id })
    await writeLines(ctx, updated, oldLines, snapshotLines)
    await storeReceipt(ctx, {
      attendeeId: attendee._id,
      orderId: updated._id,
      requestId: args.requestId,
      action: "update_pending",
      payloadHash: receipt.payloadHash,
    })
    return updated._id
  },
})

export const resubmitRejected = mutation({
  args: {
    shareToken: v.string(),
    requestId: v.string(),
    lines: v.array(lineInput),
    fulfillment: fulfillmentInput,
    proofId: v.id("paymentProofs"),
    ...guestInput,
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const { event, attendee, user } = await getEventForAttendee(
      ctx,
      args.shareToken
    )
    const receipt = await checkReceipt(
      ctx,
      attendee._id,
      args.requestId,
      "resubmit_rejected",
      args
    )
    if (receipt.replay) return receipt.replay
    requireOpenEvent(event)
    requireVerifiedEmail(user)
    const order = await activeOrder(ctx, attendee)
    if (
      !order ||
      order.paymentStatus !== "rejected" ||
      order.reservationState !== "released"
    )
      throw new ConvexError("This order cannot be resubmitted.")
    const oldLines = await getExistingLines(ctx, order._id)
    const snapshot = await buildOrderSnapshot(ctx, {
      event,
      lines: args.lines as OrderLineInput[],
      fulfillment: args.fulfillment as FulfillmentInput,
      previousLines: oldLines,
      previousOrder: order,
    })
    const { lines: snapshotLines, ...snapshotOrder } = snapshot
    if (args.proofId === order.currentProofId)
      throw new ConvexError("Upload a new payment receipt before resubmitting.")
    const proof = await requireProof(ctx, {
      proofId: args.proofId,
      eventId: event._id,
      attendeeId: attendee._id,
      orderId: order._id,
    })
    if (order.currentProofId)
      await ctx.db.patch(order.currentProofId, {
        status: "invalidated",
        invalidatedAt: Date.now(),
      })
    await adjustReservations(ctx, [], snapshotLines)
    const guestName = args.guestName.trim()
    if (!guestName || guestName.length > 160)
      throw new ConvexError("Enter your name.")
    await ctx.db.patch(order._id, {
      ...snapshotOrder,
      currency: order.currency ?? event.currency,
      paymentStatus: "pending_review",
      progress: "pending",
      reservationState: "reserved",
      guestName,
      guestEmail: user.email.trim().toLowerCase(),
      guestPhone: args.guestPhone?.trim() || undefined,
      currentProofId: proof._id,
      proofRequired: false,
      submittedAt: Date.now(),
      searchText: searchText({
        reference: order.reference,
        guestName,
        guestEmail: user.email,
      }),
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order could not be resubmitted.")
    await ctx.db.patch(proof._id, { orderId: updated._id })
    await writeLines(ctx, updated, oldLines, snapshotLines)
    await appendOrderHistory(ctx, {
      order,
      actorUserId: user._id,
      actorRole: "guest",
      paymentStatus: "pending_review",
      progress: "pending",
    })
    await storeReceipt(ctx, {
      attendeeId: attendee._id,
      orderId: updated._id,
      requestId: args.requestId,
      action: "resubmit_rejected",
      payloadHash: receipt.payloadHash,
    })
    await ctx.scheduler.runAfter(0, internalCheckout.checkout.afterSubmit, {
      orderId: updated._id,
    })
    return updated._id
  },
})

export const cancelMine = mutation({
  args: { shareToken: v.string(), requestId: v.string() },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const { event, attendee, user } = await getEventForAttendee(
      ctx,
      args.shareToken
    )
    const receipt = await checkReceipt(
      ctx,
      attendee._id,
      args.requestId,
      "cancel",
      args
    )
    if (receipt.replay) return receipt.replay
    requireOpenEvent(event)
    const order = await activeOrder(ctx, attendee)
    if (
      !order ||
      order.lifecycle !== "submitted" ||
      order.paymentStatus !== "pending_review"
    )
      throw new ConvexError(
        "Only an order waiting for payment check can be cancelled."
      )
    await releaseReservation(ctx, order)
    await ctx.db.patch(order._id, {
      lifecycle: "cancelled",
      progress: "cancelled",
      cancelledAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.db.patch(attendee._id, {
      activeOrderId: undefined,
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order could not be cancelled.")
    await patchLineProjections(ctx, updated)
    await appendOrderHistory(ctx, {
      order,
      actorUserId: user._id,
      actorRole: "guest",
      lifecycle: "cancelled",
      progress: "cancelled",
    })
    await storeReceipt(ctx, {
      attendeeId: attendee._id,
      orderId: updated._id,
      requestId: args.requestId,
      action: "cancel",
      payloadHash: receipt.payloadHash,
    })
    await ctx.scheduler.runAfter(
      0,
      internalCheckout.checkout.afterCancellation,
      { orderId: updated._id }
    )
    return updated._id
  },
})

export const generateProofUploadUrl = mutation({
  args: {
    shareToken: v.string(),
    contentType: v.string(),
    size: v.number(),
    sha256: v.string(),
  },
  returns: v.object({
    claimId: v.id("proofUploadClaims"),
    uploadUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    const { event, attendee, user } = await getEventForAttendee(
      ctx,
      args.shareToken
    )
    requireOpenEvent(event)
    const order = await activeOrder(ctx, attendee)
    if (!order)
      throw new ConvexError(
        "Save your order before uploading a payment receipt."
      )
    if (
      order.lifecycle !== "draft" &&
      order.paymentStatus !== "pending_review" &&
      order.paymentStatus !== "rejected"
    )
      throw new ConvexError("This order cannot accept another payment receipt.")
    if (!PROOF_TYPES.has(args.contentType))
      throw new ConvexError("Use a JPEG, PNG, or PDF payment receipt.")
    if (
      !Number.isSafeInteger(args.size) ||
      args.size <= 0 ||
      args.size > MAX_PROOF_BYTES
    )
      throw new ConvexError("Use a payment receipt no larger than 10 MB.")
    if (!/^[A-Za-z0-9+/]{43}=$/.test(args.sha256))
      throw new ConvexError("The receipt fingerprint is invalid.")
    const now = Date.now()
    const claims = await ctx.db
      .query("proofUploadClaims")
      .withIndex("by_eventId_and_attendeeId", (q) =>
        q.eq("eventId", event._id).eq("attendeeId", attendee._id)
      )
      .take(5)
    for (const claim of claims)
      if (claim.expiresAt <= now) await ctx.db.delete(claim._id)
    const activeClaims = claims.filter((claim) => claim.expiresAt > now)
    if (activeClaims.length >= 3)
      throw new ConvexError(
        "Finish or wait for your existing receipt uploads before starting another."
      )
    const claimId = await ctx.db.insert("proofUploadClaims", {
      eventId: event._id,
      attendeeId: attendee._id,
      orderId: order._id,
      uploaderUserId: user._id,
      contentType: args.contentType,
      size: args.size,
      sha256: args.sha256,
      expiresAt: now + CLAIM_TTL,
    })
    return { claimId, uploadUrl: await ctx.storage.generateUploadUrl() }
  },
})

export const inspectProofUpload = internalQuery({
  args: { claimId: v.id("proofUploadClaims"), storageId: v.id("_storage") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    const claim = await ctx.db.get(args.claimId)
    const metadata = await ctx.db.system.get("_storage", args.storageId)
    const order = claim ? await ctx.db.get(claim.orderId) : null
    if (
      !claim ||
      !order ||
      order.attendeeId !== claim.attendeeId ||
      order.eventId !== claim.eventId ||
      order.userId !== user._id ||
      order.lifecycle === "cancelled" ||
      (order.lifecycle !== "draft" &&
        order.paymentStatus !== "pending_review" &&
        order.paymentStatus !== "rejected") ||
      claim.uploaderUserId !== user._id ||
      claim.expiresAt < Date.now() ||
      !metadata ||
      metadata._creationTime <= claim._creationTime ||
      metadata._creationTime > claim.expiresAt ||
      metadata.sha256 !== claim.sha256 ||
      metadata.size !== claim.size ||
      metadata.contentType !== claim.contentType ||
      !PROOF_TYPES.has(metadata.contentType)
    )
      return null
    return {
      eventId: claim.eventId,
      attendeeId: claim.attendeeId,
      orderId: claim.orderId,
      uploaderUserId: claim.uploaderUserId,
      contentType: claim.contentType,
      size: claim.size,
      sha256: claim.sha256,
    }
  },
})

export const finalizeProofUpload = internalMutation({
  args: {
    claimId: v.id("proofUploadClaims"),
    storageId: v.id("_storage"),
    signatureValid: v.boolean(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), proofId: v.id("paymentProofs") }),
    v.object({ ok: v.literal(false), message: v.string() })
  ),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    const claim = await ctx.db.get(args.claimId)
    const metadata = await ctx.db.system.get("_storage", args.storageId)
    const order = claim ? await ctx.db.get(claim.orderId) : null
    if (
      !claim ||
      !order ||
      order.attendeeId !== claim.attendeeId ||
      order.eventId !== claim.eventId ||
      order.userId !== user._id ||
      order.lifecycle === "cancelled" ||
      (order.lifecycle !== "draft" &&
        order.paymentStatus !== "pending_review" &&
        order.paymentStatus !== "rejected") ||
      claim.uploaderUserId !== user._id ||
      claim.expiresAt < Date.now() ||
      !metadata ||
      metadata._creationTime <= claim._creationTime ||
      metadata._creationTime > claim.expiresAt ||
      metadata.sha256 !== claim.sha256 ||
      metadata.size !== claim.size ||
      metadata.contentType !== claim.contentType ||
      !PROOF_TYPES.has(metadata.contentType) ||
      !args.signatureValid
    ) {
      if (claim) await ctx.db.delete(claim._id)
      if (
        claim &&
        metadata &&
        metadata._creationTime > claim._creationTime &&
        metadata._creationTime <= claim.expiresAt &&
        metadata.sha256 === claim.sha256 &&
        metadata.size === claim.size
      )
        await ctx.storage.delete(args.storageId)
      return {
        ok: false as const,
        message: "This payment receipt could not be verified. Upload it again.",
      }
    }
    const proofId = await ctx.db.insert("paymentProofs", {
      eventId: claim.eventId,
      attendeeId: claim.attendeeId,
      storageId: args.storageId,
      contentType: claim.contentType,
      size: claim.size,
      sha256: claim.sha256,
      submittedByUserId: user._id,
      status: "active",
      createdAt: Date.now(),
    })
    if (order.lifecycle === "draft") {
      if (order.currentProofId)
        await ctx.db.patch(order.currentProofId, {
          status: "invalidated",
          invalidatedAt: Date.now(),
        })
      await ctx.db.patch(order._id, {
        currentProofId: proofId,
        proofRequired: false,
        updatedAt: Date.now(),
      })
    }
    await ctx.db.delete(claim._id)
    return { ok: true as const, proofId }
  },
})

export const afterSubmit = internalMutation({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId)
    if (
      !order ||
      order.paymentStatus !== "pending_review" ||
      !order.guestEmail ||
      !order.guestName
    )
      return null
    const event = await ctx.db.get(order.eventId)
    if (!event) return null
    const actionUrl = `${env.SITE_URL}/orders/${order._id}`
    await createNotification(ctx, {
      dedupeKey: `order:guest-submitted:${order._id}:${order.submittedAt ?? order.updatedAt}`,
      recipient: order.guestEmail,
      eventRef: `${event._id}`,
      orderRef: `${order._id}`,
      template: {
        kind: "guest_order_submitted",
        recipientName: order.guestName,
        eventName: event.name,
        orderReference: order.reference,
        actionUrl,
      },
    })
    const owner = await ctx.runQuery(internalAuth.auth.getUserForNotification, {
      userId: event.ownerId,
    })
    if (owner) {
      await createNotification(ctx, {
        dedupeKey: `order:organizer-new:${order._id}:${order.submittedAt ?? order.updatedAt}`,
        recipient: owner.email,
        ownerId: event.ownerId,
        eventRef: `${event._id}`,
        orderRef: `${order._id}`,
        template: {
          kind: "organizer_new_order",
          recipientName: owner.name,
          guestName: order.guestName,
          eventName: event.name,
          orderReference: order.reference,
          actionUrl: `${env.SITE_URL}/events/${event._id}/orders`,
        },
      })
    }
    await ctx.runMutation(internal.eventInvitations.markOrderSubmitted, {
      eventId: event._id,
      attendeeId: order.attendeeId,
      userId: order.userId,
      email: order.guestEmail,
      orderId: `${order._id}`,
    })
    return null
  },
})

export const afterCancellation = internalMutation({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId)
    const event = order ? await ctx.db.get(order.eventId) : null
    if (!order || !event || !order.guestEmail || !order.guestName) return null
    await createNotification(ctx, {
      dedupeKey: `order:guest-cancelled:${order._id}`,
      recipient: order.guestEmail,
      eventRef: `${event._id}`,
      orderRef: `${order._id}`,
      template: {
        kind: "guest_cancelled",
        recipientName: order.guestName,
        eventName: event.name,
        orderReference: order.reference,
        actionUrl: `${env.SITE_URL}/orders/${order._id}`,
      },
    })
    return null
  },
})

export const cleanExpiredOrderArtifacts = internalMutation({
  args: {},
  returns: v.object({ claims: v.number(), receipts: v.number() }),
  handler: async (ctx) => {
    const now = Date.now()
    const [claims, receipts] = await Promise.all([
      ctx.db
        .query("proofUploadClaims")
        .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
        .take(100),
      ctx.db
        .query("orderRequestReceipts")
        .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
        .take(100),
    ])
    for (const claim of claims) await ctx.db.delete(claim._id)
    for (const receipt of receipts) await ctx.db.delete(receipt._id)
    if (claims.length === 100 || receipts.length === 100)
      await ctx.scheduler.runAfter(
        0,
        internalCheckout.checkout.cleanExpiredOrderArtifacts,
        {}
      )
    return { claims: claims.length, receipts: receipts.length }
  },
})
