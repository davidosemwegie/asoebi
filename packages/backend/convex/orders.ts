import { ConvexError, v } from "convex/values"
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"

import { authComponent } from "./auth"
import { orderLifecycle, orderProgress, paymentStatus } from "./schema"
import { internalQuery, query } from "./_generated/server"

const orderCard = v.object({
  _id: v.id("orders"),
  eventId: v.id("events"),
  reference: v.string(),
  lifecycle: orderLifecycle,
  paymentStatus,
  progress: orderProgress,
  totalMinor: v.number(),
  currency: v.optional(v.string()),
  eventName: v.string(),
  updatedAt: v.number(),
})

export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(orderCard),
  handler: async (ctx, { paginationOpts }) => {
    const user = await authComponent.getAuthUser(ctx)
    const page = await ctx.db
      .query("orders")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(paginationOpts)
    const values = await Promise.all(
      page.page.map(async (order) => {
        const event = await ctx.db.get(order.eventId)
        return {
          _id: order._id,
          eventId: order.eventId,
          reference: order.reference,
          lifecycle: order.lifecycle,
          paymentStatus: order.paymentStatus,
          progress: order.progress,
          totalMinor: order.totalMinor,
          currency: order.currency,
          eventName: event?.name ?? "Private event",
          updatedAt: order.updatedAt,
        }
      })
    )
    return { ...page, page: values }
  },
})

export const getMine = query({
  args: { orderId: v.id("orders") },
  returns: v.any(),
  handler: async (ctx, { orderId }) => {
    const user = await authComponent.getAuthUser(ctx)
    const order = await ctx.db.get(orderId)
    if (!order || order.userId !== user._id)
      throw new ConvexError("Order not found.")
    const [event, lines, history] = await Promise.all([
      ctx.db.get(order.eventId),
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
        .take(100),
    ])
    return {
      order: {
        ...order,
        currentProofId: order.currentProofId ?? null,
        fulfillmentDetails: order.fulfillmentDetails ?? null,
      },
      event: event
        ? {
            name: event.name,
            shareToken: event.shareToken ?? null,
            orderingOpen:
              event.status === "published" &&
              (event.orderDeadlineAt ?? 0) > Date.now(),
          }
        : null,
      lines,
      history,
      receiptSubmitted: order.currentProofId !== undefined,
    }
  },
})

/** Safe for typed URLs: malformed, foreign, and unavailable orders are null. */
export const getMineForConfirmation = query({
  args: { orderId: v.string() },
  returns: v.any(),
  handler: async (ctx, { orderId }) => {
    const user = await authComponent.getAuthUser(ctx)
    const normalized = ctx.db.normalizeId("orders", orderId)
    if (!normalized) return null
    const order = await ctx.db.get(normalized)
    if (!order || order.userId !== user._id) return null
    const event = await ctx.db.get(order.eventId)
    return {
      lifecycle: order.lifecycle,
      eventShareToken: event?.shareToken ?? null,
    }
  },
})

/** The only backend projection that may reveal a proof storage id, and only to the owner. */
export const getReceiptForOwner = internalQuery({
  args: { orderId: v.id("orders") },
  returns: v.union(
    v.object({
      storageId: v.id("_storage"),
      contentType: v.string(),
      reference: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, { orderId }) => {
    const user = await authComponent.getAuthUser(ctx)
    const order = await ctx.db.get(orderId)
    if (!order) return null
    const event = await ctx.db.get(order.eventId)
    if (!event || event.ownerId !== user._id || !order.currentProofId)
      return null
    const proof = await ctx.db.get(order.currentProofId)
    if (!proof || proof.status !== "active" || proof.orderId !== order._id)
      return null
    return {
      storageId: proof.storageId,
      contentType: proof.contentType,
      reference: order.reference,
    }
  },
})
