import { ConvexError, v } from "convex/values"

import { authComponent } from "./auth"
import { internal } from "./_generated/api"
import { mutation } from "./_generated/server"

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

export const startCheckout = mutation({
  args: { shareToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { shareToken }) => {
    const user = await authComponent.getAuthUser(ctx)
    if (!SHARE_TOKEN_PATTERN.test(shareToken)) {
      throw new ConvexError("This event link is not available.")
    }

    const event = await ctx.db
      .query("events")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", shareToken))
      .unique()
    if (!event || event.status !== "published") {
      throw new ConvexError("This event link is not available.")
    }
    if (
      event.orderDeadlineAt === undefined ||
      event.orderDeadlineAt <= Date.now()
    ) {
      throw new ConvexError("The ordering deadline has passed.")
    }

    const existing = await ctx.db
      .query("eventAttendees")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", event._id).eq("userId", user._id)
      )
      .unique()
    const now = Date.now()
    const attendeeId = existing
      ? existing._id
      : await ctx.db.insert("eventAttendees", {
          eventId: event._id,
          userId: user._id,
          createdAt: now,
          updatedAt: now,
        })
    await ctx.runMutation(internal.eventInvitations.matchCheckoutStarted, {
      eventId: event._id,
      attendeeId,
      userId: user._id,
      email: user.email,
      emailVerified: user.emailVerified === true,
    })
    return null
  },
})
