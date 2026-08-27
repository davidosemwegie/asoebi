import { ConvexError, v } from "convex/values"

import { authComponent } from "./auth"
import { eventStatus } from "./schema"
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import type { Id } from "./_generated/dataModel"

const MAX_CATALOG_ITEMS = 100
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

const eventDetailsResult = eventResult.extend({
  hasCatalogItems: v.boolean(),
})

const eventInput = {
  name: v.string(),
  description: v.string(),
  eventDate: v.string(),
  orderDeadline: v.string(),
  location: v.string(),
  contact: v.string(),
  currency: v.string(),
}

type EventInput = {
  name: string
  description: string
  eventDate: string
  orderDeadline: string
  location: string
  contact: string
  currency: string
}

function normalizeEventInput(input: EventInput) {
  const values = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value.trim()])
  ) as EventInput

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

  return values
}

async function getOwnerId(ctx: MutationCtx | QueryCtx) {
  const user = await authComponent.getAuthUser(ctx)
  return user._id
}

async function requireOwnedEvent(
  ctx: MutationCtx | QueryCtx,
  eventId: Id<"events">
) {
  const event = await ctx.db.get(eventId)
  if (!event || event.ownerId !== (await getOwnerId(ctx))) {
    throw new ConvexError("Event not found.")
  }

  return event
}

async function eventHasCatalogItems(
  ctx: MutationCtx | QueryCtx,
  eventId: Id<"events">
) {
  const item = await ctx.db
    .query("items")
    .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
    .first()

  return item !== null
}

export const create = mutation({
  args: eventInput,
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const values = normalizeEventInput(args)

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
  returns: v.union(eventDetailsResult, v.null()),
  handler: async (ctx, { eventId }) => {
    const id = ctx.db.normalizeId("events", eventId)
    if (!id) return null

    const event = await ctx.db.get(id)
    if (!event || event.ownerId !== (await getOwnerId(ctx))) return null

    const { ownerId: _ownerId, ...result } = event
    return {
      ...result,
      hasCatalogItems: await eventHasCatalogItems(ctx, id),
    }
  },
})

export const update = mutation({
  args: {
    eventId: v.id("events"),
    ...eventInput,
  },
  returns: v.null(),
  handler: async (ctx, { eventId, ...input }) => {
    const event = await requireOwnedEvent(ctx, eventId)
    if (event.status === "archived") {
      throw new ConvexError("Archived events are read-only.")
    }

    const values = normalizeEventInput(input)
    if (
      values.currency !== event.currency &&
      (await eventHasCatalogItems(ctx, eventId))
    ) {
      throw new ConvexError(
        "Currency cannot be changed after catalog items are added."
      )
    }

    await ctx.db.patch("events", eventId, {
      ...values,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const remove = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const ownerId = await getOwnerId(ctx)
    const event = await ctx.db.get(eventId)
    if (!event || event.ownerId !== ownerId) return null

    if (event.status !== "draft") {
      throw new ConvexError("Only draft events can be deleted.")
    }

    const items = await ctx.db
      .query("items")
      .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
      .take(MAX_CATALOG_ITEMS + 1)

    if (items.length > MAX_CATALOG_ITEMS) {
      throw new ConvexError("The event catalog could not be deleted safely.")
    }

    for (const item of items) {
      await ctx.db.delete("items", item._id)
    }
    await ctx.db.delete("events", eventId)
    return null
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
