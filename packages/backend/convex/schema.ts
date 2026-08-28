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

// Orders intentionally retain three independent axes.  Do not collapse these
// into a single generic "status": the organizer workflow needs to reason about
// payment and fulfillment independently of the guest-visible lifecycle.
export const orderLifecycle = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("cancelled")
)
export const paymentStatus = v.union(
  v.literal("not_submitted"),
  v.literal("pending_review"),
  v.literal("confirmed"),
  v.literal("rejected")
)
export const orderProgress = v.union(
  v.literal("pending"),
  v.literal("preparing"),
  v.literal("ready_for_pickup"),
  v.literal("dispatched"),
  v.literal("fulfilled"),
  v.literal("cancelled")
)

export const reservationState = v.union(
  v.literal("none"),
  v.literal("reserved"),
  v.literal("released")
)

export const fulfillmentDetails = v.object({
  pickupContact: v.optional(v.string()),
  recipientName: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
  address: v.optional(v.string()),
  availability: v.optional(v.string()),
  notes: v.optional(v.string()),
})

export default defineSchema({
  events: defineTable(eventFields.fields)
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_shareToken", ["shareToken"])
    .index("by_coverStorageId", ["coverStorageId"]),
  items: defineTable(itemFields.fields)
    .index("by_eventId_and_sortOrder", ["eventId", "sortOrder"])
    .index("by_eventId_and_isHidden_and_sortOrder", [
      "eventId",
      "isHidden",
      "sortOrder",
    ]),
  eventAttendees: defineTable({
    eventId: v.id("events"),
    userId: v.string(),
    // Optional for the existing attendee rows created before ordering shipped.
    activeOrderId: v.optional(v.id("orders")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId_and_userId", ["eventId", "userId"])
    .index("by_userId_and_eventId", ["userId", "eventId"]),
  orders: defineTable({
    eventId: v.id("events"),
    attendeeId: v.id("eventAttendees"),
    userId: v.string(),
    reference: v.string(),
    lifecycle: orderLifecycle,
    paymentStatus,
    progress: orderProgress,
    reservationState,
    guestName: v.optional(v.string()),
    guestEmail: v.optional(v.string()),
    guestPhone: v.optional(v.string()),
    fulfillmentOptionId: v.optional(v.id("fulfillmentOptions")),
    fulfillmentOptionName: v.optional(v.string()),
    fulfillmentType: v.optional(fulfillmentType),
    fulfillmentInstructions: v.optional(v.string()),
    fulfillmentRequiredFields: v.optional(fulfillmentRequiredFields),
    fulfillmentDetails: v.optional(fulfillmentDetails),
    currency: v.optional(v.string()),
    itemSubtotalMinor: v.number(),
    fulfillmentFeeMinor: v.number(),
    totalMinor: v.number(),
    currentProofId: v.optional(v.id("paymentProofs")),
    proofRequired: v.boolean(),
    searchText: v.string(),
    submittedAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attendeeId", ["attendeeId"])
    .index("by_userId_and_updatedAt", ["userId", "updatedAt"])
    .index("by_eventId_and_lifecycle_and_updatedAt", [
      "eventId",
      "lifecycle",
      "updatedAt",
    ])
    .index("by_eventId_and_updatedAt", ["eventId", "updatedAt"])
    .index("by_eventId_and_paymentStatus_and_updatedAt", [
      "eventId",
      "paymentStatus",
      "updatedAt",
    ])
    .index("by_eventId_and_progress_and_updatedAt", [
      "eventId",
      "progress",
      "updatedAt",
    ])
    .index("by_eventId_and_fulfillmentOptionId_and_updatedAt", [
      "eventId",
      "fulfillmentOptionId",
      "updatedAt",
    ])
    .index("by_eventId_and_fulfillmentOptionId_and_paymentStatus_and_updatedAt", [
      "eventId",
      "fulfillmentOptionId",
      "paymentStatus",
      "updatedAt",
    ])
    .index("by_eventId_and_fulfillmentOptionId_and_progress_and_updatedAt", [
      "eventId",
      "fulfillmentOptionId",
      "progress",
      "updatedAt",
    ])
    .index("by_eventId_and_paymentStatus_and_progress_and_updatedAt", [
      "eventId",
      "paymentStatus",
      "progress",
      "updatedAt",
    ])
    .index("by_eventId_and_fulfillmentOptionId_and_lifecycle", [
      "eventId",
      "fulfillmentOptionId",
      "lifecycle",
    ])
    .index("by_eventId_and_fulfillmentType_and_updatedAt", [
      "eventId",
      "fulfillmentType",
      "updatedAt",
    ])
    .index("by_eventId_and_fulfillmentType_and_paymentStatus_and_updatedAt", [
      "eventId",
      "fulfillmentType",
      "paymentStatus",
      "updatedAt",
    ])
    .index("by_eventId_and_fulfillmentType_and_progress_and_updatedAt", [
      "eventId",
      "fulfillmentType",
      "progress",
      "updatedAt",
    ])
    .searchIndex("search_eventId_and_text", {
      searchField: "searchText",
      filterFields: ["eventId", "paymentStatus", "progress", "lifecycle"],
    }),
  orderLines: defineTable({
    eventId: v.id("events"),
    orderId: v.id("orders"),
    itemId: v.id("items"),
    itemName: v.string(),
    itemDescription: v.optional(v.string()),
    unitLabel: v.string(),
    quantity: v.number(),
    unitPriceMinor: v.number(),
    lineTotalMinor: v.number(),
    currency: v.string(),
    // Indexed projections are deliberately duplicated so PR 6 can filter by
    // item before pagination instead of filtering a page in memory.
    paymentStatus,
    lifecycle: orderLifecycle,
    progress: orderProgress,
    fulfillmentOptionId: v.optional(v.id("fulfillmentOptions")),
    searchText: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_eventId_and_itemId_and_paymentStatus", [
      "eventId",
      "itemId",
      "paymentStatus",
    ])
    .index("by_eventId_and_itemId_and_progress", [
      "eventId",
      "itemId",
      "progress",
    ])
    .index("by_eventId_and_itemId_and_lifecycle", [
      "eventId",
      "itemId",
      "lifecycle",
    ])
    .index("by_eventId_and_fulfillmentOptionId_and_paymentStatus", [
      "eventId",
      "fulfillmentOptionId",
      "paymentStatus",
    ]),
  paymentProofs: defineTable({
    eventId: v.id("events"),
    attendeeId: v.id("eventAttendees"),
    orderId: v.optional(v.id("orders")),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    sha256: v.string(),
    submittedByUserId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("invalidated"),
      v.literal("orphaned")
    ),
    invalidatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_eventId_and_attendeeId", ["eventId", "attendeeId"])
    .index("by_storageId", ["storageId"]),
  orderStatusHistory: defineTable({
    orderId: v.id("orders"),
    eventId: v.id("events"),
    actorUserId: v.string(),
    actorRole: v.union(
      v.literal("guest"),
      v.literal("organizer"),
      v.literal("system")
    ),
    previousLifecycle: orderLifecycle,
    lifecycle: orderLifecycle,
    previousPaymentStatus: paymentStatus,
    paymentStatus,
    previousProgress: orderProgress,
    progress: orderProgress,
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_orderId_and_createdAt", ["orderId", "createdAt"])
    .index("by_eventId_and_createdAt", ["eventId", "createdAt"]),
  orderRequestReceipts: defineTable({
    attendeeId: v.id("eventAttendees"),
    orderId: v.optional(v.id("orders")),
    requestId: v.string(),
    action: v.union(
      v.literal("submit"),
      v.literal("update_pending"),
      v.literal("resubmit_rejected"),
      v.literal("cancel")
    ),
    payloadHash: v.string(),
    resultOrderId: v.id("orders"),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_attendeeId_and_requestId", ["attendeeId", "requestId"])
    .index("by_expiresAt", ["expiresAt"]),
  proofUploadClaims: defineTable({
    eventId: v.id("events"),
    attendeeId: v.id("eventAttendees"),
    orderId: v.id("orders"),
    uploaderUserId: v.string(),
    contentType: v.string(),
    size: v.number(),
    sha256: v.string(),
    storageId: v.optional(v.id("_storage")),
    expiresAt: v.number(),
  })
    .index("by_eventId_and_attendeeId", ["eventId", "attendeeId"])
    .index("by_storageId", ["storageId"])
    .index("by_expiresAt", ["expiresAt"]),
  storageScavengerCursors: defineTable({
    name: v.string(),
    cursor: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),
  eventInvitations: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    email: v.string(),
    normalizedEmail: v.string(),
    searchText: v.string(),
    source: v.union(v.literal("manual"), v.literal("csv"), v.literal("paste")),
    latestDeliveryState: v.union(
      v.literal("not_sent"),
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("delayed"),
      v.literal("failed"),
      v.literal("suppressed")
    ),
    activity: v.union(
      v.literal("not_started"),
      v.literal("checkout_started"),
      v.literal("order_submitted"),
      v.literal("order_completed")
    ),
    matchedUserId: v.optional(v.string()),
    attendeeId: v.optional(v.id("eventAttendees")),
    orderId: v.optional(v.string()),
    sendGeneration: v.number(),
    currentNotificationId: v.optional(v.id("notifications")),
    latestSentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId_and_normalizedEmail", ["eventId", "normalizedEmail"])
    .index("by_eventId_and_createdAt", ["eventId", "createdAt"])
    .index("by_eventId_and_latestDeliveryState_and_createdAt", [
      "eventId",
      "latestDeliveryState",
      "createdAt",
    ])
    .index("by_eventId_and_activity_and_createdAt", [
      "eventId",
      "activity",
      "createdAt",
    ])
    .index("by_eventId_and_latestDeliveryState_and_activity_and_createdAt", [
      "eventId",
      "latestDeliveryState",
      "activity",
      "createdAt",
    ])
    .index("by_currentNotificationId", ["currentNotificationId"])
    .searchIndex("search_eventId_and_text", {
      searchField: "searchText",
      filterFields: ["eventId", "latestDeliveryState", "activity"],
    }),
  eventInvitationImportChunks: defineTable({
    eventId: v.id("events"),
    importId: v.string(),
    chunkIndex: v.number(),
    payloadHash: v.string(),
    outcomes: v.array(
      v.object({
        rowNumber: v.number(),
        outcome: v.union(
          v.literal("created"),
          v.literal("duplicate"),
          v.literal("invalid")
        ),
        invitationId: v.optional(v.id("eventInvitations")),
        error: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_eventId_and_importId_and_chunkIndex", [
      "eventId",
      "importId",
      "chunkIndex",
    ])
    .index("by_expiresAt", ["expiresAt"]),
  eventInvitationSendRequests: defineTable({
    eventId: v.id("events"),
    requestId: v.string(),
    kind: v.union(v.literal("send"), v.literal("retry")),
    resend: v.boolean(),
    invitationIds: v.array(v.id("eventInvitations")),
    results: v.array(
      v.object({
        invitationId: v.id("eventInvitations"),
        outcome: v.union(
          v.literal("queued"),
          v.literal("retried"),
          v.literal("already_sent"),
          v.literal("blocked"),
          v.literal("not_found")
        ),
      })
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_eventId_and_requestId", ["eventId", "requestId"])
    .index("by_expiresAt", ["expiresAt"]),
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
