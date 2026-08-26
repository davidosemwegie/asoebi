import { ConvexError, v } from "convex/values"

import { authComponent } from "./auth"
import { eventStatus } from "./schema"
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const eventResult = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.string(),
  eventDate: v.string(),
  orderDeadline: v.string(),
  location: v.string(),
  contact: v.string(),
  currency: v.string(),
  status: eventStatus,
  updatedAt: v.number(),
})

async function getOwnerId(ctx: MutationCtx | QueryCtx) {
  const user = await authComponent.getAuthUser(ctx)
  return user._id
}

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    eventDate: v.string(),
    orderDeadline: v.string(),
    location: v.string(),
    contact: v.string(),
    currency: v.string(),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const values = Object.fromEntries(
      Object.entries(args).map(([key, value]) => [key, value.trim()])
    ) as typeof args

    if (
      !values.name ||
      !values.description ||
      !values.location ||
      !values.contact
    ) {
      throw new ConvexError("Complete all event details before continuing.")
    }

    if (
      !datePattern.test(values.eventDate) ||
      !datePattern.test(values.orderDeadline)
    ) {
      throw new ConvexError("Choose an event date and ordering deadline.")
    }

    if (!["NGN", "USD", "GBP", "CAD"].includes(values.currency)) {
      throw new ConvexError("Choose a supported currency.")
    }

    return await ctx.db.insert("events", {
      ...values,
      ownerId: await getOwnerId(ctx),
      status: "draft",
      updatedAt: Date.now(),
    })
  },
})

export const get = query({
  args: { eventId: v.string() },
  returns: v.union(eventResult, v.null()),
  handler: async (ctx, { eventId }) => {
    const id = ctx.db.normalizeId("events", eventId)
    if (!id) return null

    const event = await ctx.db.get(id)
    if (!event || event.ownerId !== (await getOwnerId(ctx))) return null

    const { ownerId: _ownerId, ...result } = event
    return result
  },
})

export const listMine = query({
  args: {},
  returns: v.array(eventResult),
  handler: async (ctx) => {
    const ownerId = await getOwnerId(ctx)
    const events = await ctx.db
      .query("events")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect()

    return events.map(({ ownerId: _ownerId, ...event }) => event)
  },
})
