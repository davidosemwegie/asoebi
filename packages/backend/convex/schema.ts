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

export default defineSchema({
  events: defineTable(eventFields.fields).index("by_ownerId", ["ownerId"]),
})
