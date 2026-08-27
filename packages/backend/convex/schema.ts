import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export const eventStatus = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("closed"),
  v.literal("archived")
)

export const eventFields = v.object({
  ownerId: v.string(),
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

export const itemFields = v.object({
  eventId: v.id("events"),
  name: v.string(),
  description: v.optional(v.string()),
  unitLabel: v.string(),
  priceMinor: v.number(),
  inventoryTotal: v.number(),
  reservedQuantity: v.number(),
  isHidden: v.boolean(),
  sortOrder: v.number(),
  updatedAt: v.number(),
})

export default defineSchema({
  events: defineTable(eventFields.fields).index("by_ownerId", ["ownerId"]),
  items: defineTable(itemFields.fields)
    .index("by_eventId_and_sortOrder", ["eventId", "sortOrder"])
    .index("by_eventId_and_isHidden_and_sortOrder", [
      "eventId",
      "isHidden",
      "sortOrder",
    ]),
})
