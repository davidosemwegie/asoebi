import { ConvexError, v } from "convex/values"

import {
  MAX_CATALOG_ITEMS,
  MAX_FULFILLMENT_OPTIONS,
  generateUniqueShareToken,
  getOwnerId,
  getPublishReadiness,
  requireOwnedEvent,
  validateDeadline,
} from "./eventModel"
import {
  eventStatus,
  fulfillmentRequiredFields,
  fulfillmentType,
} from "./schema"
import type { Doc, Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"

const MAX_EVENTS_PER_OWNER = 200
const ACTIVE_EVENT_STATUSES = ["draft", "published", "closed"] as const
const datePattern = /^\d{4}-\d{2}-\d{2}$/

const readinessCode = v.union(
  v.literal("owner_email_unverified"),
  v.literal("share_token_missing"),
  v.literal("time_zone_missing"),
  v.literal("deadline_missing"),
  v.literal("deadline_not_future"),
  v.literal("available_item_missing"),
  v.literal("payment_instructions_missing"),
  v.literal("fulfillment_option_missing")
)

const readinessResult = v.object({
  isReady: v.boolean(),
  missingRequirements: v.array(
    v.object({ code: readinessCode, message: v.string() })
  ),
})

const fulfillmentOptionResult = v.object({
  _id: v.id("fulfillmentOptions"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  name: v.string(),
  type: fulfillmentType,
  feeMinor: v.number(),
  instructions: v.string(),
  enabled: v.boolean(),
  requiredFields: fulfillmentRequiredFields,
  sortOrder: v.number(),
  updatedAt: v.number(),
})

const eventResult = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.string(),
  eventDate: v.string(),
  orderDeadline: v.string(),
  orderDeadlineAt: v.optional(v.number()),
  timeZone: v.optional(v.string()),
  location: v.string(),
  contact: v.string(),
  currency: v.string(),
  shareToken: v.optional(v.string()),
  status: eventStatus,
  updatedAt: v.number(),
})

const eventDetailsResult = eventResult.extend({
  hasCatalogItems: v.boolean(),
  coverUrl: v.union(v.string(), v.null()),
  paymentInstructions: v.union(v.string(), v.null()),
  fulfillmentOptions: v.array(fulfillmentOptionResult),
  publishReadiness: readinessResult,
})

const eventInput = {
  name: v.string(),
  description: v.string(),
  eventDate: v.string(),
  orderDeadline: v.string(),
  orderDeadlineAt: v.optional(v.number()),
  timeZone: v.optional(v.string()),
  location: v.string(),
  contact: v.string(),
  currency: v.string(),
}

type EventInput = {
  name: string
  description: string
  eventDate: string
  orderDeadline: string
  orderDeadlineAt?: number
  timeZone?: string
  location: string
  contact: string
  currency: string
}

function normalizeEventInput(input: EventInput) {
  const values = {
    name: input.name.trim(),
    description: input.description.trim(),
    eventDate: input.eventDate.trim(),
    orderDeadline: input.orderDeadline.trim(),
    orderDeadlineAt: input.orderDeadlineAt,
    timeZone: input.timeZone?.trim() || undefined,
    location: input.location.trim(),
    contact: input.contact.trim(),
    currency: input.currency.trim(),
  }

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
  validateDeadline(values.orderDeadlineAt, values.timeZone)
  return values
}

function toEventResult(event: Doc<"events">) {
  return {
    _id: event._id,
    _creationTime: event._creationTime,
    name: event.name,
    description: event.description,
    eventDate: event.eventDate,
    orderDeadline: event.orderDeadline,
    orderDeadlineAt: event.orderDeadlineAt,
    timeZone: event.timeZone,
    location: event.location,
    contact: event.contact,
    currency: event.currency,
    shareToken: event.shareToken,
    status: event.status,
    updatedAt: event.updatedAt,
  }
}

async function eventHasCatalogItems(
  eventId: Id<"events">,
  ctx: Parameters<typeof requireOwnedEvent>[0]
) {
  return (
    (await ctx.db
      .query("items")
      .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
      .first()) !== null
  )
}

export const create = mutation({
  args: eventInput,
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const values = normalizeEventInput(args)
    return await ctx.db.insert("events", {
      ...values,
      ownerId: await getOwnerId(ctx),
      shareToken: await generateUniqueShareToken(ctx),
      status: "draft",
      updatedAt: Date.now(),
    })
  },
})

export const get = query({
  args: { eventId: v.string(), now: v.number() },
  returns: v.union(eventDetailsResult, v.null()),
  handler: async (ctx, { eventId, now }) => {
    const id = ctx.db.normalizeId("events", eventId)
    if (!id) return null
    const event = await ctx.db.get(id)
    if (!event || event.ownerId !== (await getOwnerId(ctx))) return null

    const [
      hasCatalogItems,
      coverUrl,
      paymentInstructions,
      fulfillmentOptions,
      publishReadiness,
    ] = await Promise.all([
      eventHasCatalogItems(id, ctx),
      event.coverStorageId
        ? ctx.storage.getUrl(event.coverStorageId)
        : Promise.resolve(null),
      ctx.db
        .query("eventPaymentInstructions")
        .withIndex("by_eventId", (q) => q.eq("eventId", id))
        .unique(),
      ctx.db
        .query("fulfillmentOptions")
        .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", id))
        .order("asc")
        .take(MAX_FULFILLMENT_OPTIONS),
      getPublishReadiness(ctx, event, now),
    ])

    return {
      ...toEventResult(event),
      hasCatalogItems,
      coverUrl,
      paymentInstructions: paymentInstructions?.instructions ?? null,
      fulfillmentOptions,
      publishReadiness,
    }
  },
})

export const getByShareToken = query({
  args: { shareToken: v.string() },
  returns: v.union(
    v.object({ eventId: v.id("events"), status: eventStatus }),
    v.null()
  ),
  handler: async (ctx, { shareToken }) => {
    if (!/^[A-Za-z0-9_-]{32}$/.test(shareToken)) return null
    const event = await ctx.db
      .query("events")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", shareToken))
      .unique()
    if (!event || !["published", "closed"].includes(event.status)) return null
    return { eventId: event._id, status: event.status }
  },
})

export const update = mutation({
  args: { eventId: v.id("events"), ...eventInput },
  returns: v.null(),
  handler: async (ctx, { eventId, ...input }) => {
    const event = await requireOwnedEvent(ctx, eventId)
    if (event.status === "archived") {
      throw new ConvexError("Archived events are read-only.")
    }
    const values = normalizeEventInput(input)
    if (
      values.currency !== event.currency &&
      (await eventHasCatalogItems(eventId, ctx))
    ) {
      throw new ConvexError(
        "Currency cannot be changed after catalog items are added."
      )
    }

    await ctx.db.patch(eventId, {
      ...values,
      shareToken: event.shareToken ?? (await generateUniqueShareToken(ctx)),
      updatedAt: Date.now(),
    })
    return null
  },
})

export const ensureShareToken = mutation({
  args: { eventId: v.id("events") },
  returns: v.string(),
  handler: async (ctx, { eventId }) => {
    const event = await requireOwnedEvent(ctx, eventId)
    if (event.status === "archived") {
      throw new ConvexError("Archived events are read-only.")
    }
    if (event.shareToken) return event.shareToken
    const shareToken = await generateUniqueShareToken(ctx)
    await ctx.db.patch(eventId, { shareToken, updatedAt: Date.now() })
    return shareToken
  },
})

function readinessError(messages: string[]) {
  return new ConvexError(
    `This event is not ready to publish: ${messages.join(" ")}`
  )
}

export const publish = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await requireOwnedEvent(ctx, eventId)
    if (event.status === "published") return null
    if (event.status !== "draft") {
      throw new ConvexError("Only a draft event can be published.")
    }
    const readiness = await getPublishReadiness(ctx, event, Date.now())
    if (!readiness.isReady) {
      throw readinessError(
        readiness.missingRequirements.map(({ message }) => message)
      )
    }
    await ctx.db.patch(eventId, {
      status: "published",
      updatedAt: Date.now(),
    })
    return null
  },
})

export const close = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await requireOwnedEvent(ctx, eventId)
    if (event.status === "closed") return null
    if (event.status !== "published") {
      throw new ConvexError("Only a published event can be closed.")
    }
    await ctx.db.patch(eventId, { status: "closed", updatedAt: Date.now() })
    return null
  },
})

export const reopen = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await requireOwnedEvent(ctx, eventId)
    if (event.status === "published") return null
    if (event.status !== "closed") {
      throw new ConvexError("Only a closed event can be reopened.")
    }
    const readiness = await getPublishReadiness(ctx, event, Date.now())
    if (!readiness.isReady) {
      throw readinessError(
        readiness.missingRequirements.map(({ message }) => message)
      )
    }
    await ctx.db.patch(eventId, {
      status: "published",
      updatedAt: Date.now(),
    })
    return null
  },
})

export const archive = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await requireOwnedEvent(ctx, eventId)
    if (event.status === "archived") return null
    if (event.status === "draft") {
      throw new ConvexError("Delete a draft event instead of archiving it.")
    }
    await ctx.db.patch(eventId, {
      status: "archived",
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

    const [items, paymentInstructions, fulfillmentOptions, coverUploadClaims] =
      await Promise.all([
        ctx.db
          .query("items")
          .withIndex("by_eventId_and_sortOrder", (q) =>
            q.eq("eventId", eventId)
          )
          .take(MAX_CATALOG_ITEMS + 1),
        ctx.db
          .query("eventPaymentInstructions")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .unique(),
        ctx.db
          .query("fulfillmentOptions")
          .withIndex("by_eventId_and_sortOrder", (q) =>
            q.eq("eventId", eventId)
          )
          .take(MAX_FULFILLMENT_OPTIONS + 1),
        ctx.db
          .query("coverUploadClaims")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .take(6),
      ])
    if (
      items.length > MAX_CATALOG_ITEMS ||
      fulfillmentOptions.length > MAX_FULFILLMENT_OPTIONS
    ) {
      throw new ConvexError("The event could not be deleted safely.")
    }

    for (const item of items) await ctx.db.delete(item._id)
    for (const option of fulfillmentOptions) await ctx.db.delete(option._id)
    for (const claim of coverUploadClaims) await ctx.db.delete(claim._id)
    if (paymentInstructions) await ctx.db.delete(paymentInstructions._id)
    if (event.coverStorageId) await ctx.storage.delete(event.coverStorageId)
    await ctx.db.delete(eventId)
    return null
  },
})

export const listMine = query({
  args: {},
  returns: v.array(eventResult),
  handler: async (ctx) => {
    const ownerId = await getOwnerId(ctx)
    const eventsByStatus = await Promise.all(
      ACTIVE_EVENT_STATUSES.map((status) =>
        ctx.db
          .query("events")
          .withIndex("by_ownerId_and_status", (q) =>
            q.eq("ownerId", ownerId).eq("status", status)
          )
          .order("desc")
          .take(MAX_EVENTS_PER_OWNER)
      )
    )
    return eventsByStatus
      .flat()
      .sort((left, right) => right._creationTime - left._creationTime)
      .slice(0, MAX_EVENTS_PER_OWNER)
      .map(toEventResult)
  },
})
