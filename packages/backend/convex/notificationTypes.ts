import type { Infer } from "convex/values"
import { v } from "convex/values"

const actionPayload = {
  recipientName: v.optional(v.string()),
  actionUrl: v.string(),
}

const orderPayload = {
  ...actionPayload,
  eventName: v.string(),
  orderReference: v.string(),
}

export const notificationTemplate = v.union(
  v.object({
    kind: v.literal("verify_email"),
    ...actionPayload,
  }),
  v.object({
    kind: v.literal("reset_password"),
    ...actionPayload,
    expiresInMinutes: v.number(),
  }),
  v.object({
    kind: v.literal("event_invitation"),
    ...actionPayload,
    eventName: v.string(),
    organizerName: v.string(),
  }),
  v.object({
    kind: v.literal("guest_order_submitted"),
    ...orderPayload,
  }),
  v.object({
    kind: v.literal("organizer_new_order"),
    ...orderPayload,
    guestName: v.string(),
  }),
  v.object({
    kind: v.literal("payment_confirmed"),
    ...orderPayload,
  }),
  v.object({
    kind: v.literal("payment_rejected"),
    ...orderPayload,
  }),
  v.object({
    kind: v.literal("guest_cancelled"),
    ...orderPayload,
  }),
  v.object({
    kind: v.literal("organizer_cancelled"),
    ...orderPayload,
  }),
  v.object({
    kind: v.literal("preparing"),
    ...orderPayload,
  }),
  v.object({
    kind: v.literal("ready_for_pickup"),
    ...orderPayload,
  }),
  v.object({
    kind: v.literal("sent_for_delivery"),
    ...orderPayload,
  }),
  v.object({
    kind: v.literal("completed"),
    ...orderPayload,
  })
)

export type NotificationTemplate = Infer<typeof notificationTemplate>

export const notificationTemplateKind = v.union(
  v.literal("verify_email"),
  v.literal("reset_password"),
  v.literal("event_invitation"),
  v.literal("guest_order_submitted"),
  v.literal("organizer_new_order"),
  v.literal("payment_confirmed"),
  v.literal("payment_rejected"),
  v.literal("guest_cancelled"),
  v.literal("organizer_cancelled"),
  v.literal("preparing"),
  v.literal("ready_for_pickup"),
  v.literal("sent_for_delivery"),
  v.literal("completed")
)

function safeSubject(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 160)
}

export function subjectForTemplate(template: NotificationTemplate): string {
  switch (template.kind) {
    case "verify_email":
      return safeSubject("Verify your Aso Circle email")
    case "reset_password":
      return safeSubject("Reset your Aso Circle password")
    case "event_invitation":
      return safeSubject(`You are invited to ${template.eventName}`)
    case "guest_order_submitted":
      return safeSubject(`We received order ${template.orderReference}`)
    case "organizer_new_order":
      return safeSubject(`New order ${template.orderReference}`)
    case "payment_confirmed":
      return safeSubject(`Payment confirmed for ${template.orderReference}`)
    case "payment_rejected":
      return safeSubject(
        `Payment needs attention for ${template.orderReference}`
      )
    case "guest_cancelled":
      return safeSubject(`Order ${template.orderReference} was cancelled`)
    case "organizer_cancelled":
      return safeSubject(
        `Order ${template.orderReference} was cancelled by the organizer`
      )
    case "preparing":
      return safeSubject(`Order ${template.orderReference} is being prepared`)
    case "ready_for_pickup":
      return safeSubject(`Order ${template.orderReference} is ready for pickup`)
    case "sent_for_delivery":
      return safeSubject(`Order ${template.orderReference} is on its way`)
    case "completed":
      return safeSubject(`Order ${template.orderReference} is complete`)
  }
}

export const notificationStatus = v.union(
  v.literal("scheduled"),
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delayed"),
  v.literal("failed"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("suppressed")
)

export type NotificationStatus = Infer<typeof notificationStatus>

export const deliveryStatus = v.union(
  v.literal("scheduled"),
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delayed"),
  v.literal("failed"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("suppressed")
)

export type DeliveryStatus = Infer<typeof deliveryStatus>

export const retryableStatuses = new Set<NotificationStatus>([
  "delayed",
  "failed",
])

export const suppressedStatuses = new Set<NotificationStatus>([
  "bounced",
  "complained",
  "suppressed",
])
