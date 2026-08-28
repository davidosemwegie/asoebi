import { ConvexError, v } from "convex/values"
import { paginationOptsValidator } from "convex/server"

import { requireOwnedEvent } from "./eventModel"
import {
  invitationActivityCounts,
  invitationDeliveryCounts,
} from "./eventInvitationAggregates"
import { projectOrderCompletion } from "./eventInvitations"
import { createNotification } from "./notifications"
import { appendOrderHistory, releaseReservation } from "./orderModel"
import {
  itemDemand,
  orderPaymentCounts,
  orderProgressCounts,
  orderValues,
  replaceLineAggregate,
  replaceOrderAggregate,
} from "./organizerOrderAggregates"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  env,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"

const statusFilter = v.optional(
  v.union(
    v.literal("not_submitted"),
    v.literal("pending_review"),
    v.literal("confirmed"),
    v.literal("rejected")
  )
)
const progressFilter = v.optional(
  v.union(
    v.literal("pending"),
    v.literal("preparing"),
    v.literal("ready_for_pickup"),
    v.literal("dispatched"),
    v.literal("fulfilled"),
    v.literal("cancelled")
  )
)
const listArgs = {
  eventId: v.id("events"),
  paginationOpts: paginationOptsValidator,
  search: v.optional(v.string()),
  itemId: v.optional(v.id("items")),
  paymentStatus: statusFilter,
  progress: progressFilter,
  fulfillmentType: v.optional(
    v.union(v.literal("pickup"), v.literal("delivery"))
  ),
  fulfillmentOptionId: v.optional(v.id("fulfillmentOptions")),
}
const paymentStatuses = ["not_submitted", "pending_review", "confirmed", "rejected"] as const
const progressStatuses = ["pending", "preparing", "ready_for_pickup", "dispatched", "fulfilled", "cancelled"] as const

const orderHistoryResult = v.object({
  _id: v.id("orderStatusHistory"),
  _creationTime: v.number(),
  orderId: v.id("orders"),
  eventId: v.id("events"),
  actorUserId: v.string(),
  actorRole: v.union(
    v.literal("guest"),
    v.literal("organizer"),
    v.literal("system")
  ),
  previousLifecycle: v.union(
    v.literal("draft"),
    v.literal("submitted"),
    v.literal("cancelled")
  ),
  lifecycle: v.union(
    v.literal("draft"),
    v.literal("submitted"),
    v.literal("cancelled")
  ),
  previousPaymentStatus: v.union(
    v.literal("not_submitted"),
    v.literal("pending_review"),
    v.literal("confirmed"),
    v.literal("rejected")
  ),
  paymentStatus: v.union(
    v.literal("not_submitted"),
    v.literal("pending_review"),
    v.literal("confirmed"),
    v.literal("rejected")
  ),
  previousProgress: progressFilter,
  progress: progressFilter,
  note: v.optional(v.string()),
  createdAt: v.number(),
})

function submittedPaymentBounds(paymentStatus: string) {
  const key: [string, string] = ["submitted", paymentStatus]
  return {
    lower: { key, inclusive: true },
    upper: { key, inclusive: true },
  }
}
function submittedProgressBounds(progress: string) {
  const key: [string, string, string] = ["submitted", "confirmed", progress]
  return {
    lower: { key, inclusive: true },
    upper: { key, inclusive: true },
  }
}
function submittedPaymentProgressBounds(paymentStatus: string, progress: string) {
  const key: [string, string, string] = ["submitted", paymentStatus, progress]
  return { lower: { key, inclusive: true }, upper: { key, inclusive: true } }
}

function invitationBounds(value: string) {
  return {
    lower: { key: value, inclusive: true },
    upper: { key: value, inclusive: true },
  }
}

async function patchLineProjections(ctx: MutationCtx, order: Doc<"orders">) {
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
    .take(100)
  for (const line of lines) {
    await ctx.db.patch(line._id, {
      paymentStatus: order.paymentStatus,
      lifecycle: order.lifecycle,
      progress: order.progress,
      fulfillmentOptionId: order.fulfillmentOptionId,
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(line._id)
    if (updated) await replaceLineAggregate(ctx, line, updated)
  }
}

function summaryOrder(order: Doc<"orders">) {
  return {
    _id: order._id,
    reference: order.reference,
    lifecycle: order.lifecycle,
    guestName: order.guestName ?? "Guest",
    guestEmail: order.guestEmail,
    guestPhone: order.guestPhone,
    totalMinor: order.totalMinor,
    itemSubtotalMinor: order.itemSubtotalMinor,
    fulfillmentFeeMinor: order.fulfillmentFeeMinor,
    currency: order.currency ?? "",
    paymentStatus: order.paymentStatus,
    progress: order.progress,
    fulfillmentType: order.fulfillmentType,
    fulfillmentOptionName: order.fulfillmentOptionName,
    submittedAt: order.submittedAt,
  }
}

type OrderListArgs = {
  eventId: Id<"events">
  paginationOpts: { numItems: number; cursor: string | null }
  search?: string
  itemId?: Id<"items">
  paymentStatus?: Doc<"orders">["paymentStatus"]
  progress?: Doc<"orders">["progress"]
  fulfillmentType?: "pickup" | "delivery"
  fulfillmentOptionId?: Id<"fulfillmentOptions">
}

type OrderListCursor = { sourceCursor: string | null; pending: string[] }

function decodeOrderListCursor(cursor: string | null): OrderListCursor {
  if (!cursor) return { sourceCursor: null, pending: [] }
  try {
    const decoded = JSON.parse(atob(cursor)) as unknown
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("sourceCursor" in decoded) ||
      !("pending" in decoded) ||
      !Array.isArray(decoded.pending) ||
      !decoded.pending.every((id) => typeof id === "string") ||
      (decoded.sourceCursor !== null &&
        typeof decoded.sourceCursor !== "string")
    )
      throw new Error("invalid")
    return decoded as OrderListCursor
  } catch {
    throw new ConvexError("This order list page has expired. Refresh the list.")
  }
}

function encodeOrderListCursor(cursor: OrderListCursor) {
  return btoa(JSON.stringify(cursor))
}

async function matchesOrderFilters(
  ctx: QueryCtx,
  order: Doc<"orders">,
  args: Pick<
    OrderListArgs,
    | "itemId"
    | "paymentStatus"
    | "progress"
    | "fulfillmentType"
    | "fulfillmentOptionId"
  >,
  search: string | undefined
) {
  if (order.lifecycle !== "submitted") return false
  if (search && !order.searchText.includes(search)) return false
  if (args.paymentStatus && order.paymentStatus !== args.paymentStatus)
    return false
  if (args.progress && order.progress !== args.progress) return false
  if (
    args.fulfillmentOptionId &&
    order.fulfillmentOptionId !== args.fulfillmentOptionId
  )
    return false
  if (args.fulfillmentType && order.fulfillmentType !== args.fulfillmentType)
    return false
  if (!args.itemId) return true
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
    .take(100)
  return lines.some((line) => line.itemId === args.itemId)
}

async function listOrders(ctx: QueryCtx, args: OrderListArgs) {
  await requireOwnedEvent(ctx, args.eventId)
  const search = args.search?.trim().toLowerCase()
  if (search && search.length > 120)
    throw new ConvexError("Search is too long.")
  const requested = Math.min(Math.max(args.paginationOpts.numItems, 1), 50)
  const cursor = decodeOrderListCursor(args.paginationOpts.cursor)
  const page: Doc<"orders">[] = []
  const pending = [...cursor.pending]
  let sourceCursor = cursor.sourceCursor
  while (pending.length > 0 && page.length < requested) {
    const order = await ctx.db.get(pending.shift() as Id<"orders">)
    if (order && (await matchesOrderFilters(ctx, order, args, search)))
      page.push(order)
  }
  let isDone = false
  while (page.length < requested && !isDone) {
    const candidates = await ctx.db
      .query("orders")
      .withIndex("by_eventId_and_lifecycle_and_updatedAt", (q) =>
        q.eq("eventId", args.eventId).eq("lifecycle", "submitted")
      )
      .order("desc")
      .paginate({ cursor: sourceCursor, numItems: 50 })
    sourceCursor = candidates.continueCursor
    isDone = candidates.isDone
    for (const order of candidates.page) {
      if (!(await matchesOrderFilters(ctx, order, args, search))) continue
      if (page.length < requested) page.push(order)
      else pending.push(`${order._id}`)
    }
  }
  const resultIsDone = isDone && pending.length === 0
  return {
    page: page.map(summaryOrder),
    isDone: resultIsDone,
    continueCursor: resultIsDone
      ? ""
      : encodeOrderListCursor({ sourceCursor, pending }),
  }
}

export const list = query({
  args: listArgs,
  returns: v.any(),
  handler: listOrders,
})

export const getSummary = query({
  args: { eventId: v.id("events") },
  returns: v.any(),
  handler: async (ctx, { eventId }) => {
    const event = await requireOwnedEvent(ctx, eventId)
    const [
      submitted,
      value,
      needsPaymentCheck,
      completed,
      confirmedAwaitingPreparation,
      items,
      notSent,
      queued,
      sent,
      delivered,
      delayed,
      failed,
      suppressed,
      ordersSubmitted,
      ordersCompleted,
    ] = await Promise.all([
      orderValues.count(ctx, {
        namespace: eventId,
        bounds: {
          lower: { key: "submitted", inclusive: true },
          upper: { key: "submitted", inclusive: true },
        },
      }),
      orderValues.sum(ctx, { namespace: eventId }),
      orderPaymentCounts.count(ctx, {
        namespace: eventId,
        bounds: submittedPaymentBounds("pending_review"),
      }),
      orderProgressCounts.count(ctx, {
        namespace: eventId,
        bounds: submittedProgressBounds("fulfilled"),
      }),
      orderProgressCounts.count(ctx, {
        namespace: eventId,
        bounds: submittedProgressBounds("pending"),
      }),
      ctx.db
        .query("items")
        .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
        .take(100),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("not_sent"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("queued"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("sent"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("delivered"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("delayed"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("failed"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("suppressed"),
      }),
      invitationActivityCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("order_submitted"),
      }),
      invitationActivityCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("order_completed"),
      }),
    ])
    const demand = await Promise.all(
      items.map(async (item) => ({
        item,
        requested: await itemDemand.sum(ctx, {
          namespace: eventId,
          bounds: {
            lower: { key: ["submitted", item._id], inclusive: true },
            upper: { key: ["submitted", item._id], inclusive: true },
          },
        }),
      }))
    )
    const paymentCounts = await Promise.all(
      paymentStatuses.map(async (paymentStatus) => [
        paymentStatus,
        await orderPaymentCounts.count(ctx, { namespace: eventId, bounds: submittedPaymentBounds(paymentStatus) }),
      ] as const)
    )
    const progressCounts = await Promise.all(
      progressStatuses.map(async (progress) => {
        const counts = await Promise.all(
          paymentStatuses.map((paymentStatus) =>
            orderProgressCounts.count(ctx, {
              namespace: eventId,
              bounds: submittedPaymentProgressBounds(paymentStatus, progress),
            })
          )
        )
        return [progress, counts.reduce((sum, value) => sum + value, 0)] as const
      })
    )
    return {
      eventName: event.name,
      currency: event.currency,
      submittedOrderCount: submitted,
      currentOrderValueMinor: value,
      paymentsNeedingReview: needsPaymentCheck,
      completedOrders: completed,
      paymentBreakdown: Object.fromEntries(paymentCounts),
      progressBreakdown: Object.fromEntries(progressCounts),
      confirmedAwaitingPreparation,
      needsAttention:
        needsPaymentCheck +
        confirmedAwaitingPreparation +
        delayed +
        failed +
        suppressed,
      items: demand.map(({ item, requested }) => ({
        itemId: item._id,
        name: item.name,
        requested,
        setAside: item.reservedQuantity,
        available: Math.max(0, item.inventoryTotal - item.reservedQuantity),
      })),
      invitations: {
        total:
          notSent + queued + sent + delivered + delayed + failed + suppressed,
        notSent,
        queued,
        sent,
        delivered,
        delayed,
        failed,
        suppressed,
        needsAttention: delayed + failed + suppressed,
        ordersSubmitted,
        ordersCompleted,
      },
    }
  },
})

export const getDetail = query({
  args: { eventId: v.id("events"), orderId: v.id("orders") },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (!order || order.eventId !== args.eventId) return null
    const [lines, history, proof] = await Promise.all([
      ctx.db
        .query("orderLines")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(100),
      ctx.db
        .query("orderStatusHistory")
        .withIndex("by_orderId_and_createdAt", (q) =>
          q.eq("orderId", order._id)
        )
        .order("desc")
        .take(50),
      order.currentProofId ? ctx.db.get(order.currentProofId) : null,
    ])
    return {
      order: summaryOrder(order),
      lines,
      history,
      receiptAvailable: Boolean(proof?.status === "active"),
      fulfillmentDetails: order.fulfillmentDetails,
      fulfillmentOptionName: order.fulfillmentOptionName,
      fulfillmentType: order.fulfillmentType,
      fulfillmentInstructions: order.fulfillmentInstructions,
    }
  },
})

export const listHistory = query({
  args: {
    eventId: v.id("events"),
    orderId: v.id("orders"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(orderHistoryResult),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (!order || order.eventId !== event._id)
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      }
    return await ctx.db
      .query("orderStatusHistory")
      .withIndex("by_orderId_and_createdAt", (q) => q.eq("orderId", order._id))
      .order("desc")
      .paginate(args.paginationOpts)
  },
})

/** Private export projection. The HTTP action carries the caller's identity, so
 * this repeats ownership verification rather than trusting a route parameter. */
/** Legacy single-page projection retained only for internal compatibility. */
export const getExportRows = internalQuery({
  args: {
    eventId: v.id("events"),
    search: v.optional(v.string()),
    paymentStatus: statusFilter,
    progress: progressFilter,
    fulfillmentOptionId: v.optional(v.id("fulfillmentOptions")),
    fulfillmentType: v.optional(
      v.union(v.literal("pickup"), v.literal("delivery"))
    ),
    itemId: v.optional(v.id("items")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    let orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId_and_lifecycle_and_updatedAt", (q) =>
        q.eq("eventId", event._id).eq("lifecycle", "submitted")
      )
      .take(1000)
    const search = args.search?.trim().toLowerCase()
    orders = orders.filter(
      (order) =>
        (!search || order.searchText.includes(search)) &&
        (!args.paymentStatus || order.paymentStatus === args.paymentStatus) &&
        (!args.progress || order.progress === args.progress) &&
        (!args.fulfillmentOptionId ||
          order.fulfillmentOptionId === args.fulfillmentOptionId) &&
        (!args.fulfillmentType ||
          order.fulfillmentType === args.fulfillmentType)
    )
    const rows: any[] = []
    for (const order of orders) {
      const lines = await ctx.db
        .query("orderLines")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(100)
      for (const line of lines) {
        if (args.itemId && line.itemId !== args.itemId) continue
        rows.push({
          reference: order.reference,
          guestName: order.guestName ?? "",
          guestEmail: order.guestEmail ?? "",
          guestPhone: order.guestPhone ?? "",
          item: line.itemName,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          lineTotalMinor: line.lineTotalMinor,
          orderTotalMinor: order.totalMinor,
          currency: order.currency ?? "",
          paymentStatus: order.paymentStatus,
          progress: order.progress,
          fulfillment: order.fulfillmentOptionName ?? "",
          fulfillmentType: order.fulfillmentType ?? "",
          submittedAt: order.submittedAt ?? order.createdAt,
          reviewedAt: order.reviewedAt ?? "",
          fulfilledAt: order.progress === "fulfilled" ? order.updatedAt : "",
          timeZone: event.timeZone ?? "UTC",
        })
      }
    }
    return rows
  },
})

export const getExportPage = internalQuery({
  args: {
    eventId: v.id("events"),
    cursor: v.union(v.string(), v.null()),
    search: v.optional(v.string()),
    paymentStatus: statusFilter,
    progress: progressFilter,
    fulfillmentOptionId: v.optional(v.id("fulfillmentOptions")),
    fulfillmentType: v.optional(
      v.union(v.literal("pickup"), v.literal("delivery"))
    ),
    itemId: v.optional(v.id("items")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const page = await ctx.db
      .query("orders")
      .withIndex("by_eventId_and_lifecycle_and_updatedAt", (q) =>
        q.eq("eventId", event._id).eq("lifecycle", "submitted")
      )
      .order("desc")
      .paginate({ numItems: 25, cursor: args.cursor })
    const search = args.search?.trim().toLowerCase()
    const rows: any[] = []
    for (const order of page.page) {
      if (!(await matchesOrderFilters(ctx, order, args, search))) continue
      const lines = await ctx.db
        .query("orderLines")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(100)
      for (const line of lines)
        if (!args.itemId || line.itemId === args.itemId)
          rows.push({
            reference: order.reference,
            guestName: order.guestName ?? "",
            guestEmail: order.guestEmail ?? "",
            guestPhone: order.guestPhone ?? "",
            item: line.itemName,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            lineTotalMinor: line.lineTotalMinor,
            orderTotalMinor: order.totalMinor,
            currency: order.currency ?? "",
            paymentStatus: order.paymentStatus,
            progress: order.progress,
            fulfillment: order.fulfillmentOptionName ?? "",
            fulfillmentType: order.fulfillmentType ?? "",
            submittedAt: order.submittedAt ?? order.createdAt,
            reviewedAt: order.reviewedAt ?? "",
            fulfilledAt: order.progress === "fulfilled" ? order.updatedAt : "",
            timeZone: event.timeZone ?? "UTC",
          })
    }
    return { rows, continueCursor: page.continueCursor, isDone: page.isDone }
  },
})

async function notify(
  ctx: MutationCtx,
  order: Doc<"orders">,
  transitionId: Id<"orderStatusHistory">,
  kind:
    | "payment_confirmed"
    | "payment_rejected"
    | "organizer_cancelled"
    | "preparing"
    | "ready_for_pickup"
    | "sent_for_delivery"
    | "completed"
) {
  const event = await ctx.db.get(order.eventId)
  if (!event || !order.guestEmail || !order.guestName) return
  await createNotification(ctx, {
    dedupeKey: `order:${kind}:${order._id}:${transitionId}`,
    recipient: order.guestEmail,
    ownerId: event.ownerId,
    eventRef: `${event._id}`,
    orderRef: `${order._id}`,
    template: {
      kind,
      recipientName: order.guestName,
      eventName: event.name,
      orderReference: order.reference,
      actionUrl: `${env.SITE_URL}/orders/${order._id}`,
    } as any,
  })
}

export const decidePayment = mutation({
  args: {
    eventId: v.id("events"),
    orderId: v.id("orders"),
    decision: v.union(v.literal("confirmed"), v.literal("rejected")),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (
      !order ||
      order.eventId !== event._id ||
      order.lifecycle !== "submitted" ||
      order.paymentStatus !== "pending_review"
    )
      throw new ConvexError("This payment decision is no longer available.")
    if (args.decision === "rejected") await releaseReservation(ctx, order)
    await ctx.db.patch(order._id, {
      paymentStatus: args.decision,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order not found.")
    await replaceOrderAggregate(ctx, order, updated)
    await patchLineProjections(ctx, updated)
    const transitionId = await appendOrderHistory(ctx, {
      order,
      actorUserId: event.ownerId,
      actorRole: "organizer",
      paymentStatus: args.decision,
      note: args.note,
    })
    await ctx.scheduler.runAfter(0, internal.organizerOrders.notifyLifecycle, {
      orderId: updated._id,
      transitionId,
      kind:
        args.decision === "confirmed"
          ? "payment_confirmed"
          : "payment_rejected",
    })
    return null
  },
})

export const advanceFulfillment = mutation({
  args: { eventId: v.id("events"), orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (
      !order ||
      order.eventId !== event._id ||
      order.lifecycle !== "submitted" ||
      order.paymentStatus !== "confirmed"
    )
      throw new ConvexError("This order is not ready to move forward.")
    const pickupTransitions: Partial<
      Record<Doc<"orders">["progress"], Doc<"orders">["progress"]>
    > = {
      pending: "preparing",
      preparing: "ready_for_pickup",
      ready_for_pickup: "fulfilled",
    }
    const deliveryTransitions: Partial<
      Record<Doc<"orders">["progress"], Doc<"orders">["progress"]>
    > = {
      pending: "preparing",
      preparing: "dispatched",
      dispatched: "fulfilled",
    }
    const next =
      order.fulfillmentType === "pickup"
        ? pickupTransitions[order.progress]
        : deliveryTransitions[order.progress]
    if (!next)
      throw new ConvexError("There is no next fulfillment step for this order.")
    await ctx.db.patch(order._id, { progress: next, updatedAt: Date.now() })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order not found.")
    await replaceOrderAggregate(ctx, order, updated)
    await patchLineProjections(ctx, updated)
    const transitionId = await appendOrderHistory(ctx, {
      order,
      actorUserId: event.ownerId,
      actorRole: "organizer",
      progress: next,
    })
    if (next === "fulfilled") {
      await projectOrderCompletion(ctx, {
        eventId: event._id,
        email: updated.guestEmail,
        orderId: updated._id,
      })
    }
    const kind =
      next === "preparing"
        ? "preparing"
        : next === "ready_for_pickup"
          ? "ready_for_pickup"
          : next === "dispatched"
            ? "sent_for_delivery"
            : "completed"
    await ctx.scheduler.runAfter(0, internal.organizerOrders.notifyLifecycle, {
      orderId: updated._id,
      transitionId,
      kind,
    })
    return null
  },
})

export const cancel = mutation({
  args: {
    eventId: v.id("events"),
    orderId: v.id("orders"),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (
      !order ||
      order.eventId !== event._id ||
      order.lifecycle !== "submitted" ||
      order.progress === "fulfilled"
    )
      throw new ConvexError("This order cannot be cancelled.")
    await releaseReservation(ctx, order)
    await ctx.db.patch(order._id, {
      lifecycle: "cancelled",
      progress: "cancelled",
      cancelledAt: Date.now(),
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order not found.")
    await replaceOrderAggregate(ctx, order, updated)
    await patchLineProjections(ctx, updated)
    const transitionId = await appendOrderHistory(ctx, {
      order,
      actorUserId: event.ownerId,
      actorRole: "organizer",
      lifecycle: "cancelled",
      progress: "cancelled",
      note: args.note,
    })
    await ctx.scheduler.runAfter(0, internal.organizerOrders.notifyLifecycle, {
      orderId: updated._id,
      transitionId,
      kind: "organizer_cancelled",
    })
    return null
  },
})

export const notifyLifecycle = internalMutation({
  args: {
    orderId: v.id("orders"),
    transitionId: v.id("orderStatusHistory"),
    kind: v.union(
      v.literal("payment_confirmed"),
      v.literal("payment_rejected"),
      v.literal("organizer_cancelled"),
      v.literal("preparing"),
      v.literal("ready_for_pickup"),
      v.literal("sent_for_delivery"),
      v.literal("completed")
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId)
    if (order) await notify(ctx, order, args.transitionId, args.kind)
    return null
  },
})
