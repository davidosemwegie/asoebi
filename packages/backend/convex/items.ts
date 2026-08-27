import { ConvexError, v } from "convex/values"

import { authComponent } from "./auth"
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"

const MAX_CATALOG_ITEMS = 100
const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 1000
const MAX_UNIT_LABEL_LENGTH = 60
const MAX_PRICE_MINOR = 999_999_999_999
const MAX_INVENTORY_TOTAL = 1_000_000

const itemResult = v.object({
  _id: v.id("items"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  name: v.string(),
  description: v.optional(v.string()),
  unitLabel: v.string(),
  priceMinor: v.number(),
  inventoryTotal: v.number(),
  reservedQuantity: v.number(),
  availableQuantity: v.number(),
  isHidden: v.boolean(),
  sortOrder: v.number(),
  updatedAt: v.number(),
})

const itemInput = {
  name: v.string(),
  description: v.optional(v.string()),
  unitLabel: v.string(),
  priceMinor: v.number(),
  inventoryTotal: v.number(),
}

type ItemInput = {
  name: string
  description?: string
  unitLabel: string
  priceMinor: number
  inventoryTotal: number
}

function normalizeItemInput(input: ItemInput) {
  const name = input.name.trim()
  const description = input.description?.trim() ?? ""
  const unitLabel = input.unitLabel.trim()

  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new ConvexError(
      `Enter an item name with ${MAX_NAME_LENGTH} characters or fewer.`
    )
  }

  if (!unitLabel || unitLabel.length > MAX_UNIT_LABEL_LENGTH) {
    throw new ConvexError(
      `Enter a unit label with ${MAX_UNIT_LABEL_LENGTH} characters or fewer.`
    )
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ConvexError(
      `Keep the description to ${MAX_DESCRIPTION_LENGTH} characters or fewer.`
    )
  }

  if (
    !Number.isSafeInteger(input.priceMinor) ||
    input.priceMinor < 0 ||
    input.priceMinor > MAX_PRICE_MINOR
  ) {
    throw new ConvexError("Enter a valid non-negative item price.")
  }

  if (
    !Number.isSafeInteger(input.inventoryTotal) ||
    input.inventoryTotal < 0 ||
    input.inventoryTotal > MAX_INVENTORY_TOTAL
  ) {
    throw new ConvexError("Enter a valid whole-number inventory quantity.")
  }

  return {
    name,
    description: description || undefined,
    unitLabel,
    priceMinor: input.priceMinor,
    inventoryTotal: input.inventoryTotal,
  }
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

async function requireEditableEvent(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await requireOwnedEvent(ctx, eventId)
  if (event.status === "archived") {
    throw new ConvexError("Archived event catalogs are read-only.")
  }

  return event
}

async function requireOwnedItem(ctx: MutationCtx, itemId: Id<"items">) {
  const item = await ctx.db.get(itemId)
  if (!item) throw new ConvexError("Item not found.")

  await requireEditableEvent(ctx, item.eventId)
  return item
}

function withAvailability(item: Doc<"items">) {
  return {
    ...item,
    availableQuantity: item.inventoryTotal - item.reservedQuantity,
  }
}

export const listForOwner = query({
  args: { eventId: v.id("events") },
  returns: v.array(itemResult),
  handler: async (ctx, { eventId }) => {
    await requireOwnedEvent(ctx, eventId)
    const items = await ctx.db
      .query("items")
      .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
      .order("asc")
      .take(MAX_CATALOG_ITEMS)

    return items.map(withAvailability)
  },
})

export const create = mutation({
  args: {
    eventId: v.id("events"),
    ...itemInput,
  },
  returns: v.id("items"),
  handler: async (ctx, { eventId, ...input }) => {
    await requireEditableEvent(ctx, eventId)
    const values = normalizeItemInput(input)
    const existingItems = await ctx.db
      .query("items")
      .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
      .take(MAX_CATALOG_ITEMS)

    if (existingItems.length >= MAX_CATALOG_ITEMS) {
      throw new ConvexError(
        `An event can have up to ${MAX_CATALOG_ITEMS} catalog items.`
      )
    }

    const lastItem = await ctx.db
      .query("items")
      .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
      .order("desc")
      .first()

    return await ctx.db.insert("items", {
      ...values,
      eventId,
      reservedQuantity: 0,
      isHidden: false,
      sortOrder: (lastItem?.sortOrder ?? -1) + 1,
      updatedAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: {
    itemId: v.id("items"),
    ...itemInput,
  },
  returns: v.null(),
  handler: async (ctx, { itemId, ...input }) => {
    const item = await requireOwnedItem(ctx, itemId)
    const values = normalizeItemInput(input)

    if (values.inventoryTotal < item.reservedQuantity) {
      throw new ConvexError(
        `Inventory cannot be lower than the ${item.reservedQuantity} units already reserved.`
      )
    }

    await ctx.db.patch("items", itemId, {
      ...values,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const setHidden = mutation({
  args: { itemId: v.id("items"), isHidden: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { itemId, isHidden }) => {
    const item = await requireOwnedItem(ctx, itemId)
    if (item.isHidden === isHidden) return null

    await ctx.db.patch("items", itemId, {
      isHidden,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const move = mutation({
  args: {
    itemId: v.id("items"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  returns: v.null(),
  handler: async (ctx, { itemId, direction }) => {
    const item = await requireOwnedItem(ctx, itemId)
    const neighbor = await ctx.db
      .query("items")
      .withIndex("by_eventId_and_sortOrder", (q) => {
        const eventItems = q.eq("eventId", item.eventId)
        return direction === "up"
          ? eventItems.lt("sortOrder", item.sortOrder)
          : eventItems.gt("sortOrder", item.sortOrder)
      })
      .order(direction === "up" ? "desc" : "asc")
      .first()

    if (!neighbor) return null

    const updatedAt = Date.now()
    await ctx.db.patch("items", item._id, {
      sortOrder: neighbor.sortOrder,
      updatedAt,
    })
    await ctx.db.patch("items", neighbor._id, {
      sortOrder: item.sortOrder,
      updatedAt,
    })
    return null
  },
})
