import {
  vOnEmailEventArgs,
  type EmailEvent,
  type EmailId,
} from "@convex-dev/resend"
import { ConvexError, v } from "convex/values"
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"

import { authComponent } from "./auth"
import { requireOwnedEvent } from "./eventModel"
import {
  insertLifecycleEmailAggregate,
  replaceLifecycleEmailAggregate,
} from "./lifecycleEmailAggregates"
import {
  deliveryStatus,
  notificationStatus,
  notificationTemplate,
  retryableStatuses,
  subjectForTemplate,
  suppressedStatuses,
  type DeliveryStatus,
  type NotificationStatus,
  type NotificationTemplate,
} from "./notificationTypes"
import { resend } from "./emailProvider"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  env,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"

const MAX_DEDUPE_KEY_LENGTH = 300
const MAX_REFERENCE_LENGTH = 200
const MAX_PAYLOAD_BYTES = 12_000
const MAX_HTML_BYTES = 102_000
const MAX_ERROR_LENGTH = 1_000

const enqueueArgs = {
  dedupeKey: v.string(),
  recipient: v.string(),
  ownerId: v.optional(v.string()),
  eventId: v.optional(v.id("events")),
  eventRef: v.optional(v.string()),
  orderRef: v.optional(v.string()),
  invitationRef: v.optional(v.string()),
  payloadExpiresAt: v.optional(v.number()),
  template: notificationTemplate,
}

const orderNotificationResult = v.object({
  _id: v.id("notifications"),
  subject: v.string(),
  status: notificationStatus,
  latestAttemptNumber: v.number(),
  retryBlockedReason: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConvexError("A valid recipient email is required.")
  }
  return email
}

function bounded(value: string | undefined, name: string) {
  if (value !== undefined && value.length > MAX_REFERENCE_LENGTH) {
    throw new ConvexError(`${name} is too long.`)
  }
  return value
}

function validateTemplate(template: NotificationTemplate) {
  if (
    new TextEncoder().encode(JSON.stringify(template)).byteLength >
    MAX_PAYLOAD_BYTES
  ) {
    throw new ConvexError("The email template payload is too large.")
  }
  const url = new URL(template.actionUrl)
  if (
    !["http:", "https:"].includes(url.protocol) ||
    template.actionUrl.length > 2_048
  ) {
    throw new ConvexError("The email action URL is invalid.")
  }
}

async function hasSuppression(
  ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
  recipient: string
) {
  for (const status of suppressedStatuses) {
    if (
      await ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_status", (q) =>
          q.eq("recipient", recipient).eq("status", status)
        )
        .first()
    ) {
      return true
    }
  }
  return false
}

export async function createNotification(
  ctx: MutationCtx,
  args: {
    dedupeKey: string
    recipient: string
    ownerId?: string
    eventId?: Id<"events">
    eventRef?: string
    orderRef?: string
    invitationRef?: string
    payloadExpiresAt?: number
    template: NotificationTemplate
  }
) {
  const dedupeKey = args.dedupeKey.trim()
  if (!dedupeKey || dedupeKey.length > MAX_DEDUPE_KEY_LENGTH) {
    throw new ConvexError("The notification dedupe key is invalid.")
  }
  validateTemplate(args.template)
  const recipient = normalizeEmail(args.recipient)
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
    .unique()
  if (existing) return existing._id

  const now = Date.now()
  const isSuppressed = await hasSuppression(ctx, recipient)
  const notificationId = await ctx.db.insert("notifications", {
    dedupeKey,
    recipient,
    subject: subjectForTemplate(args.template),
    templateKind: args.template.kind,
    template: args.template,
    ownerId: bounded(args.ownerId, "Owner reference"),
    eventId: args.eventId,
    eventRef: bounded(args.eventRef, "Event reference"),
    orderRef: bounded(args.orderRef, "Order reference"),
    invitationRef: bounded(args.invitationRef, "Invitation reference"),
    status: isSuppressed ? "suppressed" : "scheduled",
    latestAttemptNumber: 1,
    activeAttemptNumber: isSuppressed ? undefined : 1,
    suppressionReason: isSuppressed
      ? "Delivery is blocked for this recipient."
      : undefined,
    payloadExpiresAt: args.payloadExpiresAt,
    createdAt: now,
    updatedAt: now,
  })
  const notification = await ctx.db.get(notificationId)
  if (notification) await insertLifecycleEmailAggregate(ctx, notification)
  await ctx.db.insert("notificationDeliveries", {
    notificationId,
    attemptNumber: 1,
    recipient,
    status: isSuppressed ? "suppressed" : "scheduled",
    error: isSuppressed ? "Delivery is blocked for this recipient." : undefined,
    failedAt: isSuppressed ? now : undefined,
    createdAt: now,
    updatedAt: now,
  })
  if (!isSuppressed) {
    await ctx.scheduler.runAfter(0, internal.emailActions.renderAndEnqueue, {
      notificationId,
      attemptNumber: 1,
    })
  }
  return notificationId
}

export const enqueueInternal = internalMutation({
  args: enqueueArgs,
  returns: v.id("notifications"),
  handler: async (ctx, args) => await createNotification(ctx, args),
})

export const getForRendering = internalQuery({
  args: {
    notificationId: v.id("notifications"),
    attemptNumber: v.number(),
  },
  returns: v.union(
    v.object({
      recipient: v.string(),
      subject: v.string(),
      template: notificationTemplate,
      alreadyEnqueued: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx, { notificationId, attemptNumber }) => {
    const [notification, delivery] = await Promise.all([
      ctx.db.get(notificationId),
      ctx.db
        .query("notificationDeliveries")
        .withIndex("by_notificationId_and_attemptNumber", (q) =>
          q
            .eq("notificationId", notificationId)
            .eq("attemptNumber", attemptNumber)
        )
        .unique(),
    ])
    if (!notification?.template || !delivery) return null
    return {
      recipient: notification.recipient,
      subject: notification.subject,
      template: notification.template,
      alreadyEnqueued: delivery.componentEmailId !== undefined,
    }
  },
})

export const enqueueRendered = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    attemptNumber: v.number(),
    to: v.string(),
    html: v.string(),
    text: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    if (!args.text.trim())
      throw new Error("Plain-text email content is required")
    if (new TextEncoder().encode(args.html).byteLength >= MAX_HTML_BYTES) {
      throw new Error("Rendered email exceeds 102 KB")
    }
    const notification = await ctx.db.get(args.notificationId)
    const delivery = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_notificationId_and_attemptNumber", (q) =>
        q
          .eq("notificationId", args.notificationId)
          .eq("attemptNumber", args.attemptNumber)
      )
      .unique()
    if (!notification || !delivery)
      throw new Error("Delivery attempt not found")
    if (delivery.componentEmailId) return delivery.componentEmailId
    if (notification.activeAttemptNumber !== args.attemptNumber) {
      throw new Error("Delivery attempt is no longer active")
    }
    if (
      notification.payloadExpiresAt &&
      notification.payloadExpiresAt <= Date.now()
    ) {
      throw new Error("Email action has expired")
    }
    if (await hasSuppression(ctx, notification.recipient)) {
      throw new Error("Recipient is suppressed")
    }

    const mode = env.EMAIL_DELIVERY_MODE ?? "test"
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured")
    if (mode === "live") {
      if (!env.EMAIL_FROM)
        throw new Error("EMAIL_FROM is required in live mode")
      if (!env.RESEND_WEBHOOK_SECRET) {
        throw new Error("RESEND_WEBHOOK_SECRET is required in live mode")
      }
      if (normalizeEmail(args.to) !== notification.recipient) {
        throw new Error("Live recipient does not match the notification")
      }
    } else if (!/^[a-z0-9.+_-]+@resend\.dev$/i.test(args.to)) {
      throw new Error("Test mode only permits Resend test recipients")
    }

    const componentEmailId = await resend.sendEmail(ctx, {
      from: env.EMAIL_FROM ?? "Aso Circle <onboarding@resend.dev>",
      to: args.to,
      subject: notification.subject,
      html: args.html,
      text: args.text,
    })
    const now = Date.now()
    await ctx.db.patch(delivery._id, {
      componentEmailId,
      status: "queued",
      queuedAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(notification._id, {
      status: "queued",
      latestComponentEmailId: componentEmailId,
      updatedAt: now,
    })
    const queuedNotification = await ctx.db.get(notification._id)
    if (queuedNotification) {
      await replaceLifecycleEmailAggregate(
        ctx,
        notification,
        queuedNotification
      )
    }
    await ctx.runMutation(
      internal.eventInvitations.projectNotificationDelivery,
      {
        notificationId: notification._id,
        status: "queued",
      }
    )
    await ctx.scheduler.runAfter(
      30 * 60 * 1_000,
      internal.emailActions.reconcileComponentStatus,
      {
        notificationId: notification._id,
        attemptNumber: args.attemptNumber,
        componentEmailId,
        checkNumber: 1,
      }
    )
    return componentEmailId
  },
})

export const markAttemptFailed = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    attemptNumber: v.number(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId)
    const delivery = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_notificationId_and_attemptNumber", (q) =>
        q
          .eq("notificationId", args.notificationId)
          .eq("attemptNumber", args.attemptNumber)
      )
      .unique()
    if (!notification || !delivery || delivery.componentEmailId) return null
    const now = Date.now()
    const error = args.error.slice(0, MAX_ERROR_LENGTH)
    await ctx.db.patch(delivery._id, {
      status: "failed",
      error,
      failedAt: now,
      updatedAt: now,
    })
    if (notification.activeAttemptNumber === args.attemptNumber) {
      await ctx.db.patch(notification._id, {
        status: "failed",
        updatedAt: now,
      })
      const failedNotification = await ctx.db.get(notification._id)
      if (failedNotification) {
        await replaceLifecycleEmailAggregate(
          ctx,
          notification,
          failedNotification
        )
      }
      await ctx.runMutation(
        internal.eventInvitations.projectNotificationDelivery,
        {
          notificationId: notification._id,
          status: "failed",
        }
      )
    }
    return null
  },
})

const deliveryResult = v.object({
  attemptNumber: v.number(),
  status: deliveryStatus,
  error: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

function publicDeliveryError(status: DeliveryStatus) {
  switch (status) {
    case "delayed":
      return "Delivery is taking longer than expected."
    case "failed":
      return "Delivery was not completed. You can try again."
    case "bounced":
      return "Delivery was blocked because the email address could not receive messages."
    case "complained":
    case "suppressed":
      return "Delivery is blocked for this email address."
    case "scheduled":
    case "queued":
    case "sent":
    case "delivered":
      return undefined
  }
}

export const getMine = query({
  args: { notificationId: v.id("notifications") },
  returns: v.union(
    v.object({
      notificationId: v.id("notifications"),
      subject: v.string(),
      status: notificationStatus,
      createdAt: v.number(),
      updatedAt: v.number(),
      deliveries: v.array(deliveryResult),
    }),
    v.null()
  ),
  handler: async (ctx, { notificationId }) => {
    const user = await authComponent.safeGetAuthUser(ctx)
    const notification = await ctx.db.get(notificationId)
    if (!user || !notification || notification.ownerId !== user._id) return null
    const deliveries = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_notificationId_and_attemptNumber", (q) =>
        q.eq("notificationId", notificationId)
      )
      .order("asc")
      .take(50)
    return {
      notificationId: notification._id,
      subject: notification.subject,
      status: notification.status,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
      deliveries: deliveries.map((delivery) => ({
        attemptNumber: delivery.attemptNumber,
        status: delivery.status,
        error: publicDeliveryError(delivery.status),
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
      })),
    }
  },
})

/** Owner-scoped, cursor-paginated notification history for one organizer order. */
export const listOrderHistory = query({
  args: {
    eventId: v.id("events"),
    orderId: v.id("orders"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(orderNotificationResult),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (!order || order.eventId !== event._id)
      throw new ConvexError("Order not found.")
    const page = await ctx.db
      .query("notifications")
      .withIndex("by_orderRef_and_updatedAt", (q) =>
        q.eq("orderRef", `${order._id}`)
      )
      .order("desc")
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page
        .filter(
          (notification) =>
            notification.ownerId === event.ownerId &&
            notification.eventRef === `${event._id}`
        )
        .map((notification) => ({
          _id: notification._id,
          subject: notification.subject,
          status: notification.status,
          latestAttemptNumber: notification.latestAttemptNumber,
          retryBlockedReason: notification.retryBlockedReason,
          createdAt: notification.createdAt,
          updatedAt: notification.updatedAt,
        })),
    }
  },
})

async function retryNotification(
  ctx: MutationCtx,
  notification: Doc<"notifications">
) {
  if (!retryableStatuses.has(notification.status)) {
    throw new ConvexError("This notification is not eligible for retry.")
  }
  if (notification.retryBlockedReason) {
    throw new ConvexError("This notification is not eligible for retry.")
  }
  if (!notification.template) {
    throw new ConvexError("This notification can no longer be retried.")
  }
  if (
    notification.payloadExpiresAt &&
    notification.payloadExpiresAt <= Date.now()
  ) {
    throw new ConvexError("This notification has expired.")
  }
  if (await hasSuppression(ctx, notification.recipient)) {
    throw new ConvexError("Delivery is blocked for this recipient.")
  }
  const attemptNumber = notification.latestAttemptNumber + 1
  const now = Date.now()
  await ctx.db.insert("notificationDeliveries", {
    notificationId: notification._id,
    attemptNumber,
    recipient: notification.recipient,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.patch(notification._id, {
    status: "scheduled",
    latestAttemptNumber: attemptNumber,
    activeAttemptNumber: attemptNumber,
    updatedAt: now,
  })
  const scheduledNotification = await ctx.db.get(notification._id)
  if (scheduledNotification) {
    await replaceLifecycleEmailAggregate(ctx, notification, scheduledNotification)
  }
  await ctx.scheduler.runAfter(0, internal.emailActions.renderAndEnqueue, {
    notificationId: notification._id,
    attemptNumber,
  })
  return attemptNumber
}

export const retryInternal = internalMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.number(),
  handler: async (ctx, { notificationId }) => {
    const notification = await ctx.db.get(notificationId)
    if (!notification) throw new ConvexError("Notification not found.")
    const attemptNumber = await retryNotification(ctx, notification)
    await ctx.runMutation(
      internal.eventInvitations.projectNotificationDelivery,
      {
        notificationId,
        status: "scheduled",
      }
    )
    return attemptNumber
  },
})

export const retryMine = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.number(),
  handler: async (ctx, { notificationId }) => {
    const user = await authComponent.safeGetAuthUser(ctx)
    const notification = await ctx.db.get(notificationId)
    if (!user || !notification || notification.ownerId !== user._id) {
      throw new ConvexError("Notification not found.")
    }
    if (notification.invitationRef) {
      throw new ConvexError("Retry guest invitations from the guest list.")
    }
    const attemptNumber = await retryNotification(ctx, notification)
    await ctx.runMutation(
      internal.eventInvitations.projectNotificationDelivery,
      {
        notificationId,
        status: "scheduled",
      }
    )
    return attemptNumber
  },
})

type ProviderUpdate = {
  status: DeliveryStatus
  reason?: string
  permanent: boolean
}

export function providerUpdate(event: EmailEvent): ProviderUpdate | null {
  switch (event.type) {
    case "email.sent":
      return { status: "sent", permanent: false }
    case "email.delivered":
      return { status: "delivered", permanent: false }
    case "email.delivery_delayed":
      return { status: "delayed", permanent: false }
    case "email.failed":
      return {
        status: "failed",
        reason: event.data.failed.reason,
        permanent: false,
      }
    case "email.complained":
      return {
        status: "complained",
        reason: "The recipient reported this email as spam.",
        permanent: true,
      }
    case "email.bounced": {
      const suppressed =
        event.data.bounce.subType.toLowerCase() === "suppressed"
      const hard = event.data.bounce.type.toLowerCase() === "permanent"
      return {
        status: suppressed ? "suppressed" : hard ? "bounced" : "failed",
        reason: event.data.bounce.message,
        permanent: suppressed || hard,
      }
    }
    case "email.opened":
    case "email.clicked":
      return null
  }
}

const precedence: Record<DeliveryStatus, number> = {
  scheduled: 0,
  queued: 1,
  sent: 2,
  delayed: 3,
  failed: 4,
  delivered: 5,
  bounced: 6,
  complained: 7,
  suppressed: 8,
}

async function applyProviderUpdate(
  ctx: MutationCtx,
  delivery: Doc<"notificationDeliveries">,
  eventType: string,
  eventAt: number,
  providerId: string | undefined,
  update: ProviderUpdate,
  recordsProviderEvent = true
) {
  const notification = await ctx.db.get(delivery.notificationId)
  if (!notification) return
  if (
    recordsProviderEvent &&
    delivery.providerEventAt === eventAt &&
    delivery.providerEventType === eventType
  ) {
    return
  }
  const firstProviderEvent =
    recordsProviderEvent && delivery.providerEventAt === undefined
  const preservesHigherDeliveryStatus =
    firstProviderEvent &&
    precedence[update.status] < precedence[delivery.status]
  if (
    !recordsProviderEvent &&
    delivery.providerEventAt !== undefined &&
    precedence[update.status] <= precedence[delivery.status]
  ) {
    return
  }
  const currentPermanent = suppressedStatuses.has(delivery.status)
  if (currentPermanent && !update.permanent) return
  if (
    recordsProviderEvent &&
    currentPermanent &&
    update.permanent &&
    delivery.providerEventAt !== undefined &&
    (eventAt < delivery.providerEventAt ||
      (eventAt === delivery.providerEventAt &&
        precedence[update.status] <= precedence[delivery.status]))
  ) {
    return
  }
  if (
    recordsProviderEvent &&
    !update.permanent &&
    delivery.providerEventAt !== undefined &&
    (eventAt < delivery.providerEventAt ||
      (eventAt === delivery.providerEventAt &&
        precedence[update.status] <= precedence[delivery.status]))
  ) {
    return
  }

  const now = Date.now()
  await ctx.db.patch(delivery._id, {
    ...(providerId ? { providerId } : {}),
    status: preservesHigherDeliveryStatus ? delivery.status : update.status,
    error: preservesHigherDeliveryStatus
      ? delivery.error
      : update.reason?.slice(0, MAX_ERROR_LENGTH),
    ...(recordsProviderEvent
      ? { providerEventAt: eventAt, providerEventType: eventType }
      : {}),
    sentAt: update.status === "sent" ? eventAt : delivery.sentAt,
    deliveredAt: update.status === "delivered" ? eventAt : delivery.deliveredAt,
    failedAt:
      update.status === "failed" || update.permanent
        ? eventAt
        : delivery.failedAt,
    updatedAt: now,
  })
  const notificationPermanent = suppressedStatuses.has(notification.status)
  const preservesHigherNotificationStatus =
    firstProviderEvent &&
    precedence[update.status] < precedence[notification.status]
  if (
    update.permanent ||
    (!notificationPermanent &&
      notification.activeAttemptNumber === delivery.attemptNumber)
  ) {
    await ctx.db.patch(notification._id, {
      status: preservesHigherNotificationStatus
        ? notification.status
        : update.status,
      ...(providerId ? { latestProviderId: providerId } : {}),
      ...(recordsProviderEvent
        ? {
            latestProviderEventAt: eventAt,
            latestProviderEventType: eventType,
          }
        : {}),
      suppressionReason: preservesHigherNotificationStatus
        ? notification.suppressionReason
        : update.permanent
          ? (update.reason?.slice(0, MAX_ERROR_LENGTH) ??
            "Delivery is blocked.")
          : notification.suppressionReason,
      retryBlockedReason: preservesHigherNotificationStatus
        ? notification.retryBlockedReason
        : undefined,
      updatedAt: now,
    })
    const currentNotification = await ctx.db.get(notification._id)
    if (currentNotification) {
      await replaceLifecycleEmailAggregate(ctx, notification, currentNotification)
      await ctx.runMutation(
        internal.eventInvitations.projectNotificationDelivery,
        {
          notificationId: notification._id,
          status: currentNotification.status,
        }
      )
    }
  }
}

async function applyPendingSuppression(
  ctx: MutationCtx,
  delivery: Doc<"notificationDeliveries">,
  providerId: string
) {
  const currentDelivery = await ctx.db.get(delivery._id)
  if (!currentDelivery) return
  const pending = await ctx.db
    .query("pendingEmailSuppressions")
    .withIndex("by_providerId", (q) => q.eq("providerId", providerId))
    .unique()
  if (!pending) return
  await applyProviderUpdate(
    ctx,
    currentDelivery,
    "email.suppressed",
    pending.eventAt,
    providerId,
    {
      status: "suppressed",
      reason: pending.reason,
      permanent: true,
    }
  )
  await ctx.db.delete(pending._id)
}

export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  returns: v.null(),
  handler: async (ctx, { id, event }) => {
    const update = providerUpdate(event)
    if (!update) return null
    const delivery = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_componentEmailId", (q) => q.eq("componentEmailId", id))
      .unique()
    if (!delivery) return null
    const eventAt = Date.parse(event.created_at)
    await applyProviderUpdate(
      ctx,
      delivery,
      event.type,
      Number.isFinite(eventAt) ? eventAt : Date.now(),
      event.data.email_id,
      update
    )
    await applyPendingSuppression(ctx, delivery, event.data.email_id)
    return null
  },
})

export const reconcileComponentStatus = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    attemptNumber: v.number(),
    componentEmailId: v.string(),
    providerId: v.optional(v.string()),
    status: deliveryStatus,
    reason: v.optional(v.string()),
    permanent: v.boolean(),
    retryAllowed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_notificationId_and_attemptNumber", (q) =>
        q
          .eq("notificationId", args.notificationId)
          .eq("attemptNumber", args.attemptNumber)
      )
      .unique()
    if (!delivery || delivery.componentEmailId !== args.componentEmailId) {
      return null
    }
    await applyProviderUpdate(
      ctx,
      delivery,
      `component.${args.status}`,
      Date.now(),
      args.providerId,
      {
        status: args.status,
        reason: args.reason,
        permanent: args.permanent,
      },
      false
    )
    if (args.retryAllowed === false) {
      const notification = await ctx.db.get(args.notificationId)
      if (notification?.activeAttemptNumber === args.attemptNumber) {
        await ctx.db.patch(notification._id, {
          retryBlockedReason:
            "Provider state could not be confirmed; retry is blocked to prevent duplicate delivery.",
          updatedAt: Date.now(),
        })
      }
    }
    if (args.providerId) {
      await applyPendingSuppression(ctx, delivery, args.providerId)
    }
    return null
  },
})

export const handleSuppressedEvent = internalMutation({
  args: {
    providerId: v.string(),
    createdAt: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_providerId", (q) => q.eq("providerId", args.providerId))
      .unique()
    if (!delivery) {
      const existing = await ctx.db
        .query("pendingEmailSuppressions")
        .withIndex("by_providerId", (q) => q.eq("providerId", args.providerId))
        .unique()
      const parsed = Date.parse(args.createdAt)
      const eventAt = Number.isFinite(parsed) ? parsed : Date.now()
      const reason = (
        args.reason ?? "Resend suppressed delivery to this recipient."
      ).slice(0, MAX_ERROR_LENGTH)
      if (!existing) {
        const now = Date.now()
        await ctx.db.insert("pendingEmailSuppressions", {
          providerId: args.providerId,
          eventAt,
          reason,
          createdAt: now,
          updatedAt: now,
        })
      } else if (eventAt >= existing.eventAt) {
        await ctx.db.patch(existing._id, {
          eventAt,
          reason,
          updatedAt: Date.now(),
        })
      }
      return null
    }
    const parsed = Date.parse(args.createdAt)
    await applyProviderUpdate(
      ctx,
      delivery,
      "email.suppressed",
      Number.isFinite(parsed) ? parsed : Date.now(),
      args.providerId,
      {
        status: "suppressed",
        reason: args.reason ?? "Resend suppressed delivery to this recipient.",
        permanent: true,
      }
    )
    return null
  },
})

export type { EmailId, NotificationStatus }
