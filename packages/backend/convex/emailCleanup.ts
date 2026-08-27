import { components } from "./_generated/api"
import { v } from "convex/values"

import { internalMutation } from "./_generated/server"

const DAY = 24 * 60 * 60 * 1_000

export const cleanFinalizedBodies = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, components.resend.lib.cleanupOldEmails, {
      olderThan: 7 * DAY,
    })
    return null
  },
})

export const cleanAbandonedRecords = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      components.resend.lib.cleanupAbandonedEmails,
      { olderThan: 28 * DAY }
    )
    return null
  },
})

export const scrubExpiredApplicationPayloads = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("notifications")
      .withIndex("by_payloadExpiresAt", (q) =>
        q.gt("payloadExpiresAt", 0).lt("payloadExpiresAt", Date.now())
      )
      .take(100)
    for (const notification of expired) {
      await ctx.db.patch(notification._id, {
        template: undefined,
        payloadExpiresAt: undefined,
        updatedAt: Date.now(),
      })
    }
    return null
  },
})

export const cleanPendingSuppressions = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 28 * DAY
    const stale = await ctx.db
      .query("pendingEmailSuppressions")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(100)
    for (const event of stale) await ctx.db.delete(event._id)
    return null
  },
})
