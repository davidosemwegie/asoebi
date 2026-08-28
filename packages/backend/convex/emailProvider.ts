import { Resend } from "@convex-dev/resend"

import { components, internal } from "./_generated/api"
import { env } from "./_generated/server"

export const emailDeliveryMode = env.EMAIL_DELIVERY_MODE ?? "test"

export const resend: Resend = new Resend(components.resend, {
  apiKey: env.RESEND_API_KEY ?? "",
  webhookSecret: env.RESEND_WEBHOOK_SECRET ?? "",
  testMode: emailDeliveryMode !== "live",
  onEmailEvent: internal.notifications.handleEmailEvent,
})
