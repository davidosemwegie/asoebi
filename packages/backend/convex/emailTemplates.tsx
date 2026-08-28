import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import { render } from "@react-email/render"
import type { CSSProperties, ReactElement } from "react"

import {
  subjectForTemplate,
  type NotificationTemplate,
} from "./notificationTypes"

export { subjectForTemplate } from "./notificationTypes"

type EmailCopy = {
  heading: string
  preview: string
  message: string
  detail?: string
  actionLabel: string
}

const styles = {
  body: {
    backgroundColor: "#f4f4f5",
    color: "#18181b",
    fontFamily: "Arial, Helvetica, sans-serif",
    margin: "0",
    padding: "24px 12px",
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #d4d4d8",
    borderRadius: "8px",
    margin: "0 auto",
    maxWidth: "600px",
    padding: "32px 24px",
  },
  brand: {
    color: "#3f3f46",
    fontSize: "16px",
    fontWeight: "700",
    letterSpacing: "0.04em",
    margin: "0 0 24px",
  },
  heading: {
    color: "#18181b",
    fontSize: "28px",
    fontWeight: "700",
    lineHeight: "36px",
    margin: "0 0 20px",
  },
  text: {
    color: "#27272a",
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0 0 18px",
  },
  detail: {
    backgroundColor: "#f4f4f5",
    border: "1px solid #d4d4d8",
    borderRadius: "6px",
    color: "#18181b",
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0 0 22px",
    padding: "16px",
  },
  buttonSection: {
    margin: "24px 0",
  },
  button: {
    backgroundColor: "#18181b",
    borderRadius: "6px",
    boxSizing: "border-box",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: "20px",
    padding: "14px 22px",
    textAlign: "center",
    textDecoration: "none",
  },
  fallbackLabel: {
    color: "#3f3f46",
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0 0 8px",
  },
  fallbackUrl: {
    color: "#18181b",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "0",
    overflowWrap: "anywhere",
    wordBreak: "break-all",
  },
  divider: {
    borderColor: "#d4d4d8",
    borderStyle: "solid",
    margin: "28px 0 20px",
  },
  footer: {
    color: "#52525b",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "0",
  },
} satisfies Record<string, CSSProperties>

function greeting(name: string | undefined): string {
  const trimmed = name?.trim()
  return trimmed ? `Hello ${trimmed},` : "Hello,"
}

function orderDetail(template: {
  eventName: string
  orderReference: string
}): string {
  return `Event: ${template.eventName}\nOrder reference: ${template.orderReference}`
}

function copyForTemplate(template: NotificationTemplate): EmailCopy {
  switch (template.kind) {
    case "verify_email":
      return {
        heading: "Verify your email address",
        preview: "Verify your email address for your Asoebi account.",
        message: `${greeting(template.recipientName)} Please verify your email address to finish setting up your Asoebi account.`,
        actionLabel: "Verify email address",
      }
    case "reset_password": {
      const minutes = template.expiresInMinutes
      const duration = `${minutes} minute${minutes === 1 ? "" : "s"}`
      return {
        heading: "Reset your password",
        preview: "Use this secure link to reset your Asoebi password.",
        message: `${greeting(template.recipientName)} A password reset was requested for your Asoebi account. This link expires in ${duration}.`,
        detail:
          "If you did not request this change, you can ignore this email. Your password will stay the same.",
        actionLabel: "Reset password",
      }
    }
    case "event_invitation":
      return {
        heading: "You are invited",
        preview: `${template.organizerName} invited you to ${template.eventName}.`,
        message: `${greeting(template.recipientName)} ${template.organizerName} invited you to ${template.eventName} on Asoebi.`,
        detail: `Event: ${template.eventName}`,
        actionLabel: "View invitation",
      }
    case "guest_order_submitted":
      return {
        heading: "Your order was submitted",
        preview: `We received order ${template.orderReference}.`,
        message: `${greeting(template.recipientName)} We received your order. Open Asoebi to see its current status.`,
        detail: orderDetail(template),
        actionLabel: "View order",
      }
    case "organizer_new_order":
      return {
        heading: "You have a new order",
        preview: `${template.guestName} submitted order ${template.orderReference}.`,
        message: `${greeting(template.recipientName)} ${template.guestName} submitted a new order for ${template.eventName}.`,
        detail: orderDetail(template),
        actionLabel: "Review order",
      }
    case "payment_confirmed":
      return {
        heading: "Your payment was confirmed",
        preview: `Payment was confirmed for order ${template.orderReference}.`,
        message: `${greeting(template.recipientName)} Payment was confirmed for your order.`,
        detail: orderDetail(template),
        actionLabel: "View order",
      }
    case "payment_rejected":
      return {
        heading: "Your payment needs attention",
        preview: `Payment needs attention for order ${template.orderReference}.`,
        message: `${greeting(template.recipientName)} We could not confirm payment for your order. Open Asoebi to review the status and next steps.`,
        detail: orderDetail(template),
        actionLabel: "Review order",
      }
    case "guest_cancelled":
      return {
        heading: "Your order was cancelled",
        preview: `Order ${template.orderReference} was cancelled.`,
        message: `${greeting(template.recipientName)} Your order was cancelled at your request.`,
        detail: orderDetail(template),
        actionLabel: "View order",
      }
    case "organizer_cancelled":
      return {
        heading: "The organizer cancelled your order",
        preview: `The organizer cancelled order ${template.orderReference}.`,
        message: `${greeting(template.recipientName)} The organizer cancelled your order. Open Asoebi to see the details.`,
        detail: orderDetail(template),
        actionLabel: "View order",
      }
    case "preparing":
      return {
        heading: "Your order is being prepared",
        preview: `Order ${template.orderReference} is being prepared.`,
        message: `${greeting(template.recipientName)} The organizer has started preparing your order.`,
        detail: orderDetail(template),
        actionLabel: "View order",
      }
    case "ready_for_pickup":
      return {
        heading: "Your order is ready for pickup",
        preview: `Order ${template.orderReference} is ready for pickup.`,
        message: `${greeting(template.recipientName)} Your order is ready for pickup. Open Asoebi to see the latest details.`,
        detail: orderDetail(template),
        actionLabel: "View order",
      }
    case "sent_for_delivery":
      return {
        heading: "Your order was sent for delivery",
        preview: `Order ${template.orderReference} is on its way.`,
        message: `${greeting(template.recipientName)} Your order has been sent for delivery. Open Asoebi to see its current status.`,
        detail: orderDetail(template),
        actionLabel: "View order",
      }
    case "completed":
      return {
        heading: "Your order is complete",
        preview: `Order ${template.orderReference} is complete.`,
        message: `${greeting(template.recipientName)} The organizer marked your order as complete.`,
        detail: orderDetail(template),
        actionLabel: "View order",
      }
  }
}

function assertAbsoluteHttpUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("Email action URL must be an absolute HTTP or HTTPS URL")
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Email action URL must be an absolute HTTP or HTTPS URL")
  }
}

function AsoebiEmail({
  actionLabel,
  actionUrl,
  detail,
  heading,
  message,
  preview,
}: EmailCopy & { actionUrl: string }): ReactElement {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Body style={styles.body}>
        <Preview>{preview}</Preview>
        <Container style={styles.container}>
          <Text style={styles.brand}>ASOEBI</Text>
          <Heading as="h1" style={styles.heading}>
            {heading}
          </Heading>
          <Text style={styles.text}>{message}</Text>
          {detail ? (
            <Section style={styles.detail}>
              {detail.split("\n").map((line) => (
                <Text key={line} style={{ ...styles.text, margin: "0" }}>
                  {line}
                </Text>
              ))}
            </Section>
          ) : null}
          <Section style={styles.buttonSection}>
            <Button href={actionUrl} style={styles.button}>
              {actionLabel}
            </Button>
          </Section>
          <Text style={styles.fallbackLabel}>
            If the button does not work, copy and paste this address into your
            browser:
          </Text>
          <Text style={styles.fallbackUrl}>{actionUrl}</Text>
          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            This message was sent by Asoebi about your account, invitation, or
            order.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderNotificationEmail(
  template: NotificationTemplate
): Promise<{
  subject: string
  html: string
  text: string
  heading: string
}> {
  assertAbsoluteHttpUrl(template.actionUrl)
  const copy = copyForTemplate(template)
  const email = <AsoebiEmail {...copy} actionUrl={template.actionUrl} />

  const [html, text] = await Promise.all([
    render(email),
    render(email, { plainText: true }),
  ])

  if (!text.trim()) {
    throw new Error("Rendered email must include a plain-text body")
  }

  return {
    subject: subjectForTemplate(template),
    html,
    text,
    heading: copy.heading,
  }
}
