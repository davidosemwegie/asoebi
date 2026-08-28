import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import {
  deliveryStatus,
  notificationStatus,
  notificationTemplate,
  notificationTemplateKind,
} from "./notificationTypes"

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
    .index("by_ownerId_and_status", ["ownerId", "status"])
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
  notifications: defineTable({
    dedupeKey: v.string(),
    recipient: v.string(),
    subject: v.string(),
    templateKind: notificationTemplateKind,
    template: v.optional(notificationTemplate),
    ownerId: v.optional(v.string()),
    eventRef: v.optional(v.string()),
    orderRef: v.optional(v.string()),
    invitationRef: v.optional(v.string()),
    status: notificationStatus,
    latestAttemptNumber: v.number(),
    activeAttemptNumber: v.optional(v.number()),
    latestComponentEmailId: v.optional(v.string()),
    latestProviderId: v.optional(v.string()),
    latestProviderEventAt: v.optional(v.number()),
    latestProviderEventType: v.optional(v.string()),
    suppressionReason: v.optional(v.string()),
    retryBlockedReason: v.optional(v.string()),
    payloadExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_recipient_and_status", ["recipient", "status", "updatedAt"])
    .index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"])
    .index("by_eventRef_and_updatedAt", ["eventRef", "updatedAt"])
    .index("by_orderRef_and_updatedAt", ["orderRef", "updatedAt"])
    .index("by_invitationRef_and_updatedAt", ["invitationRef", "updatedAt"])
    .index("by_payloadExpiresAt", ["payloadExpiresAt"])
    .index("by_updatedAt", ["updatedAt"]),
  notificationDeliveries: defineTable({
    notificationId: v.id("notifications"),
    attemptNumber: v.number(),
    recipient: v.string(),
    componentEmailId: v.optional(v.string()),
    providerId: v.optional(v.string()),
    status: deliveryStatus,
    error: v.optional(v.string()),
    providerEventAt: v.optional(v.number()),
    providerEventType: v.optional(v.string()),
    queuedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_notificationId_and_attemptNumber", [
      "notificationId",
      "attemptNumber",
    ])
    .index("by_componentEmailId", ["componentEmailId"])
    .index("by_providerId", ["providerId"])
    .index("by_recipient_and_status", ["recipient", "status", "updatedAt"])
    .index("by_notificationId_and_createdAt", ["notificationId", "createdAt"]),
  pendingEmailSuppressions: defineTable({
    providerId: v.string(),
    eventAt: v.number(),
    reason: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_providerId", ["providerId"])
    .index("by_createdAt", ["createdAt"]),
})
