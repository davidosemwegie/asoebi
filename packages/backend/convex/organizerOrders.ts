import { ConvexError, v } from "convex/values"
import { paginationOptsValidator } from "convex/server"

import { requireOwnedEvent } from "./eventModel"
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
} from "./_generated/server"

const internalOrganizer = internal as unknown as {
  organizerOrders: { notifyLifecycle: any }
}

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
  fulfillmentOptionId: v.optional(v.id("fulfillmentOptions")),
}

function paymentBounds(paymentStatus: string) {
  return {
    lower: { key: paymentStatus, inclusive: true },
    upper: { key: paymentStatus, inclusive: true },
  }
}
function progressBounds(progress: string) {
  return {
    lower: { key: progress, inclusive: true },
    upper: { key: progress, inclusive: true },
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
    guestName: order.guestName ?? "Guest",
    guestEmail: order.guestEmail,
    totalMinor: order.totalMinor,
    currency: order.currency ?? "",
    paymentStatus: order.paymentStatus,
    progress: order.progress,
    fulfillmentType: order.fulfillmentType,
    fulfillmentOptionName: order.fulfillmentOptionName,
    submittedAt: order.submittedAt,
  }
}

async function listOrders(ctx: any, args: any) {
  await requireOwnedEvent(ctx, args.eventId)
  const search = args.search?.trim().toLowerCase()
  if (search && search.length > 120)
    throw new ConvexError("Search is too long.")
  let result: any
  if (search) {
    result = await ctx.db
      .query("orders")
      .withSearchIndex("search_eventId_and_text", (q: any) => {
        let indexed = q.search("searchText", search).eq("eventId", args.eventId)
        if (args.paymentStatus)
          indexed = indexed.eq("paymentStatus", args.paymentStatus)
        if (args.progress) indexed = indexed.eq("progress", args.progress)
        return indexed.eq("lifecycle", "submitted")
      })
      .paginate(args.paginationOpts)
  } else if (args.paymentStatus) {
    result = await ctx.db
      .query("orders")
      .withIndex("by_eventId_and_paymentStatus_and_updatedAt", (q: any) =>
        q.eq("eventId", args.eventId).eq("paymentStatus", args.paymentStatus)
      )
      .order("desc")
      .paginate(args.paginationOpts)
  } else if (args.progress) {
    result = await ctx.db
      .query("orders")
      .withIndex("by_eventId_and_progress_and_updatedAt", (q: any) =>
        q.eq("eventId", args.eventId).eq("progress", args.progress)
      )
      .order("desc")
      .paginate(args.paginationOpts)
  } else if (args.fulfillmentOptionId) {
    result = await ctx.db
      .query("orders")
      .withIndex("by_eventId_and_fulfillmentOptionId_and_updatedAt", (q: any) =>
        q
          .eq("eventId", args.eventId)
          .eq("fulfillmentOptionId", args.fulfillmentOptionId)
      )
      .order("desc")
      .paginate(args.paginationOpts)
  } else {
    result = await ctx.db
      .query("orders")
      .withIndex("by_eventId_and_lifecycle_and_updatedAt", (q: any) =>
        q.eq("eventId", args.eventId).eq("lifecycle", "submitted")
      )
      .order("desc")
      .paginate(args.paginationOpts)
  }
  let page = result.page.filter(
    (order: Doc<"orders">) => order.lifecycle === "submitted"
  )
  if (args.fulfillmentOptionId)
    page = page.filter(
      (order: Doc<"orders">) =>
        order.fulfillmentOptionId === args.fulfillmentOptionId
    )
  if (args.itemId) {
    const matches = await Promise.all(
      page.map(async (order: Doc<"orders">) =>
        (
          await ctx.db
            .query("orderLines")
            .withIndex("by_orderId", (q: any) => q.eq("orderId", order._id))
            .take(100)
        ).some((line: Doc<"orderLines">) => line.itemId === args.itemId)
      )
    )
    page = page.filter((_order: Doc<"orders">, index: number) => matches[index])
  }
  return { ...result, page: page.map(summaryOrder) }
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
    const [submitted, value, needsPaymentCheck, completed, items] =
      await Promise.all([
        orderValues.count(ctx, {
          namespace: eventId,
          bounds: paymentBounds("submitted"),
        }),
        orderValues.sum(ctx, { namespace: eventId }),
        orderPaymentCounts.count(ctx, {
          namespace: eventId,
          bounds: paymentBounds("pending_review"),
        }),
        orderProgressCounts.count(ctx, {
          namespace: eventId,
          bounds: progressBounds("fulfilled"),
        }),
        ctx.db
          .query("items")
          .withIndex("by_eventId_and_sortOrder", (q) =>
            q.eq("eventId", eventId)
          )
          .take(100),
      ])
    const invitationRows = await ctx.db
      .query("eventInvitations")
      .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", eventId))
      .take(1000)
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
    return {
      eventName: event.name,
      currency: event.currency,
      submittedOrderCount: submitted,
      currentOrderValueMinor: value,
      paymentsNeedingReview: needsPaymentCheck,
      completedOrders: completed,
      needsAttention:
        needsPaymentCheck +
        invitationRows.filter(
          (row) =>
            row.latestDeliveryState === "failed" ||
            row.latestDeliveryState === "delayed"
        ).length,
      items: demand.map(({ item, requested }) => ({
        itemId: item._id,
        name: item.name,
        requested,
        setAside: item.reservedQuantity,
        available: Math.max(0, item.inventoryTotal - item.reservedQuantity),
      })),
      invitations: {
        total: invitationRows.length,
        sent: invitationRows.filter(
          (row) =>
            row.latestDeliveryState === "sent" ||
            row.latestDeliveryState === "delivered"
        ).length,
        needsAttention: invitationRows.filter(
          (row) =>
            row.latestDeliveryState === "failed" ||
            row.latestDeliveryState === "delayed"
        ).length,
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
    const [lines, history, proof, notifications] = await Promise.all([
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
      ctx.db
        .query("notifications")
        .withIndex("by_orderRef_and_updatedAt", (q) =>
          q.eq("orderRef", `${order._id}`)
        )
        .take(50),
    ])
    return {
      order: summaryOrder(order),
      lines,
      history,
      receiptAvailable: Boolean(proof?.status === "active"),
      fulfillmentDetails: order.fulfillmentDetails,
      fulfillmentInstructions: order.fulfillmentInstructions,
      notifications: notifications.map((notification) => ({
        _id: notification._id,
        subject: notification.subject,
        status: notification.status,
        createdAt: notification.createdAt,
      })),
    }
  },
})

/** Private export projection. The HTTP action carries the caller's identity, so
 * this repeats ownership verification rather than trusting a route parameter. */
export const getExportRows = internalQuery({
  args: {
    eventId: v.id("events"),
    search: v.optional(v.string()),
    paymentStatus: statusFilter,
    progress: progressFilter,
    fulfillmentOptionId: v.optional(v.id("fulfillmentOptions")),
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
          order.fulfillmentOptionId === args.fulfillmentOptionId)
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

async function notify(
  ctx: MutationCtx,
  order: Doc<"orders">,
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
    dedupeKey: `order:${kind}:${order._id}:${order.updatedAt}`,
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
    await appendOrderHistory(ctx, {
      order,
      actorUserId: event.ownerId,
      actorRole: "organizer",
      paymentStatus: args.decision,
      note: args.note,
    })
    await ctx.scheduler.runAfter(
      0,
      internalOrganizer.organizerOrders.notifyLifecycle,
      {
        orderId: updated._id,
        kind:
          args.decision === "confirmed"
            ? "payment_confirmed"
            : "payment_rejected",
      }
    )
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
    await appendOrderHistory(ctx, {
      order,
      actorUserId: event.ownerId,
      actorRole: "organizer",
      progress: next,
    })
    const kind =
      next === "preparing"
        ? "preparing"
        : next === "ready_for_pickup"
          ? "ready_for_pickup"
          : next === "dispatched"
            ? "sent_for_delivery"
            : "completed"
    await ctx.scheduler.runAfter(
      0,
      internalOrganizer.organizerOrders.notifyLifecycle,
      { orderId: updated._id, kind }
    )
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
    await appendOrderHistory(ctx, {
      order,
      actorUserId: event.ownerId,
      actorRole: "organizer",
      lifecycle: "cancelled",
      progress: "cancelled",
      note: args.note,
    })
    await ctx.scheduler.runAfter(
      0,
      internalOrganizer.organizerOrders.notifyLifecycle,
      { orderId: updated._id, kind: "organizer_cancelled" }
    )
    return null
  },
})

export const notifyLifecycle = internalMutation({
  args: {
    orderId: v.id("orders"),
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
    if (order) await notify(ctx, order, args.kind)
    return null
  },
})
