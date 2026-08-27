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
  orderDeadlineAt: v.optional(v.number()),
  timeZone: v.optional(v.string()),
  location: v.string(),
  contact: v.string(),
  currency: v.string(),
  shareToken: v.optional(v.string()),
  coverStorageId: v.optional(v.id("_storage")),
  status: eventStatus,
  updatedAt: v.number(),
})

export const fulfillmentType = v.union(
  v.literal("pickup"),
  v.literal("delivery")
)

export const fulfillmentRequiredFields = v.union(
  v.object({
    kind: v.literal("pickup"),
    pickupContact: v.boolean(),
  }),
  v.object({
    kind: v.literal("delivery"),
    recipientName: v.boolean(),
    phoneNumber: v.boolean(),
    address: v.boolean(),
    availability: v.boolean(),
    notes: v.boolean(),
  })
)

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
  events: defineTable(eventFields.fields)
    .index("by_ownerId", ["ownerId"])
    .index("by_shareToken", ["shareToken"]),
  items: defineTable(itemFields.fields)
    .index("by_eventId_and_sortOrder", ["eventId", "sortOrder"])
    .index("by_eventId_and_isHidden_and_sortOrder", [
      "eventId",
      "isHidden",
      "sortOrder",
    ]),
  eventPaymentInstructions: defineTable({
    eventId: v.id("events"),
    instructions: v.string(),
    updatedAt: v.number(),
  }).index("by_eventId", ["eventId"]),
  fulfillmentOptions: defineTable({
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
    .index("by_eventId_and_sortOrder", ["eventId", "sortOrder"])
    .index("by_eventId_and_enabled_and_sortOrder", [
      "eventId",
      "enabled",
      "sortOrder",
    ]),
  coverUploadClaims: defineTable({
    eventId: v.id("events"),
    ownerId: v.string(),
    contentType: v.string(),
    size: v.number(),
    sha256: v.string(),
    expiresAt: v.number(),
  }).index("by_eventId", ["eventId"]),
})
