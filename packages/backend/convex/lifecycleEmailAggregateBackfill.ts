import { v } from "convex/values"

import {
  insertLifecycleEmailAggregate,
  isLifecycleEmail,
  replaceLifecycleEmailAggregate,
} from "./lifecycleEmailAggregates"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"

/**
 * Idempotently adds the typed event projection and aggregate entry for legacy
 * lifecycle emails. The order lookup verifies the old string reference before
 * it becomes a tenant-scoped event identifier.
 */
export const backfillPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    notifications: v.number(),
  }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("notifications")
      .withIndex("by_updatedAt")
      .paginate({ cursor, numItems: 50 })
    let notifications = 0
    for (const notification of page.page) {
      if (!notification.orderRef || notification.invitationRef) continue
      const order = await ctx.db.get(notification.orderRef as Id<"orders">)
      if (!order || `${order._id}` !== notification.orderRef) continue
      if (!notification.eventId) {
        await ctx.db.patch(notification._id, { eventId: order.eventId })
        const updated = await ctx.db.get(notification._id)
        if (updated) {
          await replaceLifecycleEmailAggregate(ctx, notification, updated)
          if (isLifecycleEmail(updated)) notifications += 1
        }
      } else {
        await insertLifecycleEmailAggregate(ctx, notification)
        if (isLifecycleEmail(notification)) notifications += 1
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.lifecycleEmailAggregateBackfill.backfillPage,
        { cursor: page.continueCursor }
      )
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      notifications,
    }
  },
})
