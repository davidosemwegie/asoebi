// @vitest-environment node

import { describe, expect, it } from "vitest"

import { renderNotificationEmail, subjectForTemplate } from "./emailTemplates"
import type { NotificationTemplate } from "./notificationTypes"

const actionUrl = "https://asoebi.example/account/action"

const cases: Array<{
  name: string
  template: NotificationTemplate
  subject: string
  heading: string
  actionLabel: string
}> = [
  {
    name: "verify email",
    template: {
      kind: "verify_email",
      recipientName: "Ada",
      actionUrl,
    },
    subject: "Verify your Asoebi email",
    heading: "Verify your email address",
    actionLabel: "Verify email address",
  },
  {
    name: "reset password",
    template: {
      kind: "reset_password",
      recipientName: "Ada",
      actionUrl,
      expiresInMinutes: 30,
    },
    subject: "Reset your Asoebi password",
    heading: "Reset your password",
    actionLabel: "Reset password",
  },
  {
    name: "event invitation",
    template: {
      kind: "event_invitation",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      organizerName: "Amaka",
    },
    subject: "You are invited to Amaka and Chidi's Wedding",
    heading: "You are invited",
    actionLabel: "View invitation",
  },
  {
    name: "guest order submitted",
    template: {
      kind: "guest_order_submitted",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
    },
    subject: "We received order ASB-1042",
    heading: "Your order was submitted",
    actionLabel: "View order",
  },
  {
    name: "organizer new order",
    template: {
      kind: "organizer_new_order",
      recipientName: "Amaka",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
      guestName: "Ada",
    },
    subject: "New order ASB-1042",
    heading: "You have a new order",
    actionLabel: "Review order",
  },
  {
    name: "payment confirmed",
    template: {
      kind: "payment_confirmed",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
    },
    subject: "Payment confirmed for ASB-1042",
    heading: "Your payment was confirmed",
    actionLabel: "View order",
  },
  {
    name: "payment rejected",
    template: {
      kind: "payment_rejected",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
    },
    subject: "Payment needs attention for ASB-1042",
    heading: "Your payment needs attention",
    actionLabel: "Review order",
  },
  {
    name: "guest-initiated cancellation",
    template: {
      kind: "guest_cancelled",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
    },
    subject: "Order ASB-1042 was cancelled",
    heading: "Your order was cancelled",
    actionLabel: "View order",
  },
  {
    name: "organizer-initiated cancellation",
    template: {
      kind: "organizer_cancelled",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
    },
    subject: "Order ASB-1042 was cancelled by the organizer",
    heading: "The organizer cancelled your order",
    actionLabel: "View order",
  },
  {
    name: "preparing",
    template: {
      kind: "preparing",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
    },
    subject: "Order ASB-1042 is being prepared",
    heading: "Your order is being prepared",
    actionLabel: "View order",
  },
  {
    name: "ready for pickup",
    template: {
      kind: "ready_for_pickup",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
    },
    subject: "Order ASB-1042 is ready for pickup",
    heading: "Your order is ready for pickup",
    actionLabel: "View order",
  },
  {
    name: "sent for delivery",
    template: {
      kind: "sent_for_delivery",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
    },
    subject: "Order ASB-1042 is on its way",
    heading: "Your order was sent for delivery",
    actionLabel: "View order",
  },
  {
    name: "completed",
    template: {
      kind: "completed",
      recipientName: "Ada",
      actionUrl,
      eventName: "Amaka and Chidi's Wedding",
      orderReference: "ASB-1042",
    },
    subject: "Order ASB-1042 is complete",
    heading: "Your order is complete",
    actionLabel: "View order",
  },
]

const forbiddenContent = [
  "bank account",
  "bank instructions",
  "routing number",
  "sort code",
  "wire transfer",
  "receipt image",
  "delivery address",
  "street address",
  "phone number",
  "whatsapp",
]

describe("notification email rendering", () => {
  for (const testCase of cases) {
    it(`renders the ${testCase.name} variant safely`, async () => {
      const rendered = await renderNotificationEmail(testCase.template)
      const lowerContent = `${rendered.html}\n${rendered.text}`.toLowerCase()

      expect(subjectForTemplate(testCase.template)).toBe(testCase.subject)
      expect(rendered.subject).toBe(testCase.subject)
      expect(rendered.heading).toBe(testCase.heading)
      expect(rendered.html).toContain("<h1")
      expect(rendered.html).toContain(testCase.heading)
      expect(rendered.html.match(/<a\b/g)).toHaveLength(1)
      expect(rendered.html).toContain(testCase.actionLabel)
      expect(rendered.html).toContain(`>${actionUrl}</p>`)
      expect(rendered.text).toContain(actionUrl)
      expect(rendered.text.trim().length).toBeGreaterThan(0)
      expect(rendered.html).toContain("font-size:16px")
      expect(Buffer.byteLength(rendered.html, "utf8")).toBeLessThan(102 * 1024)

      for (const forbidden of forbiddenContent) {
        expect(lowerContent).not.toContain(forbidden)
      }

      expect(rendered.html).not.toMatch(/<svg\b|\.webp\b/i)
      expect(rendered.html).not.toMatch(/display:\s*(flex|grid)/i)
      expect(rendered.html).not.toMatch(/@media|prefers-color-scheme/i)
    })
  }

  it("escapes dynamic content in subjects and rendered bodies", async () => {
    const template: NotificationTemplate = {
      kind: "event_invitation",
      recipientName: "<Ada & Co>",
      actionUrl: "https://asoebi.example/invitations/safe",
      eventName: "<Dinner & Dance>",
      organizerName: "<Organizer>",
    }

    const rendered = await renderNotificationEmail(template)

    expect(rendered.subject).toBe("You are invited to <Dinner & Dance>")
    expect(rendered.html).not.toContain("<Ada & Co>")
    expect(rendered.html).not.toContain("<Dinner & Dance>")
    expect(rendered.html).toContain("&lt;Ada &amp; Co&gt;")
    expect(rendered.html).toContain("&lt;Dinner &amp; Dance&gt;")
  })

  it("escapes an absolute action URL in HTML and keeps it usable in text", async () => {
    const escapedActionUrl =
      "https://asoebi.example/verify?token=one&next=%2Faccount"

    const rendered = await renderNotificationEmail({
      kind: "verify_email",
      actionUrl: escapedActionUrl,
    })

    expect(rendered.html).toContain(
      "https://asoebi.example/verify?token=one&amp;next=%2Faccount"
    )
    expect(rendered.html).not.toContain(
      "https://asoebi.example/verify?token=one&next=%2Faccount"
    )
    expect(rendered.text).toContain(escapedActionUrl)
  })

  it.each(["/relative", "mailto:person@example.com", "javascript:alert(1)"])(
    "rejects a non-HTTP(S) action URL: %s",
    async (unsafeUrl) => {
      await expect(
        renderNotificationEmail({
          kind: "verify_email",
          actionUrl: unsafeUrl,
        })
      ).rejects.toThrow("absolute HTTP or HTTPS URL")
    }
  )
})
