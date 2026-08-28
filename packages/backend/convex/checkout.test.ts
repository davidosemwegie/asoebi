/// <reference types="vite/client" />

import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { api, components } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const DAY = 24 * 60 * 60 * 1_000

beforeAll(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-is-at-least-32-characters")
  vi.stubEnv("SITE_URL", "http://localhost:3000")
  vi.stubEnv("RESEND_API_KEY", "re_test_only")
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test_only")
  vi.stubEnv("EMAIL_FROM", "Asoebi <onboarding@resend.dev>")
  vi.stubEnv("EMAIL_DELIVERY_MODE", "test")
})

function test() {
  const t = convexTest(schema, modules)
  betterAuthTest.register(t)
  return t
}

async function user(
  t: ReturnType<typeof test>,
  email: string,
  verified = true
) {
  const now = Date.now()
  const account = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: email.split("@")[0],
        email,
        emailVerified: verified,
        createdAt: now,
        updatedAt: now,
      },
    },
  })
  const session = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "session",
      data: {
        userId: account._id,
        token: `token-${email}`,
        expiresAt: now + DAY,
        createdAt: now,
        updatedAt: now,
      },
    },
  })
  return {
    client: t.withIdentity({ subject: account._id, sessionId: session._id }),
    userId: account._id,
  }
}

async function readyEvent(t: ReturnType<typeof test>) {
  const owner = await user(t, "owner@example.com")
  const eventId = await owner.client.mutation(api.events.create, {
    name: "Wedding",
    description: "Family celebration",
    eventDate: "2027-12-12",
    orderDeadline: "2027-12-01",
    orderDeadlineAt: Date.now() + DAY,
    timeZone: "Africa/Lagos",
    location: "Lagos",
    contact: "Owner",
    currency: "NGN",
  })
  const itemId = await owner.client.mutation(api.items.create, {
    eventId,
    name: "Lace",
    unitLabel: "bundle",
    priceMinor: 10_000,
    inventoryTotal: 1,
  })
  const optionId = await owner.client.mutation(
    api.eventSetup.createFulfillmentOption,
    {
      eventId,
      name: "Pickup",
      type: "pickup",
      feeMinor: 500,
      instructions: "Bring ID",
      enabled: true,
      requiredFields: { kind: "pickup", pickupContact: true },
    }
  )
  await owner.client.mutation(api.eventSetup.savePaymentInstructions, {
    eventId,
    instructions: "Bank transfer",
  })
  await owner.client.mutation(api.events.publish, { eventId })
  const event = await owner.client.query(api.events.get, {
    eventId,
    now: Date.now(),
  })
  return { itemId, optionId, shareToken: event!.shareToken! }
}

describe("guest checkout", () => {
  it("lets an uninvited attendee save items and a required fulfillment option before entering details, without reserving inventory", async () => {
    const t = test()
    const event = await readyEvent(t)
    const guest = await user(t, "uninvited@example.com")
    await guest.client.mutation(api.eventAttendees.startCheckout, {
      shareToken: event.shareToken,
    })
    await guest.client.mutation(api.checkout.saveDraft, {
      shareToken: event.shareToken,
      lines: [{ itemId: event.itemId, quantity: 1 }],
    })
    const orderId = await guest.client.mutation(api.checkout.saveDraft, {
      shareToken: event.shareToken,
      lines: [{ itemId: event.itemId, quantity: 1 }],
      fulfillment: { optionId: event.optionId },
    })
    const checkout = await guest.client.query(api.checkout.get, {
      shareToken: event.shareToken,
    })
    expect(checkout!.order!._id).toBe(orderId)
    expect(checkout!.lines).toHaveLength(1)
    expect(checkout!.order!.fulfillmentOptionId).toBe(event.optionId)
    await t.run(async (ctx) => {
      expect((await ctx.db.get(event.itemId))!.reservedQuantity).toBe(0)
    })
  })

  it("keeps verified-email enforcement at submission rather than attendee creation", async () => {
    const t = test()
    const event = await readyEvent(t)
    const guest = await user(t, "not-verified@example.com", false)
    await expect(
      guest.client.mutation(api.eventAttendees.startCheckout, {
        shareToken: event.shareToken,
      })
    ).resolves.toBeNull()
    await guest.client.mutation(api.checkout.saveDraft, {
      shareToken: event.shareToken,
      lines: [{ itemId: event.itemId, quantity: 1 }],
      fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
    })
    const checkout = await guest.client.query(api.checkout.get, {
      shareToken: event.shareToken,
    })
    expect(checkout!.attendee.emailVerified).toBe(false)
    expect(checkout!.order!.lifecycle).toBe("draft")
  })
})
