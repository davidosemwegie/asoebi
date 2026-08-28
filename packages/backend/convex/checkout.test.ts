/// <reference types="vite/client" />

import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { api, components } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
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
  return { itemId, optionId, shareToken: event!.shareToken!, owner }
}

async function proofFor(
  t: ReturnType<typeof test>,
  orderId: Id<"orders">,
  userId: string
) {
  return await t.run(async (ctx) => {
    const order = await ctx.db.get(orderId)
    if (!order) throw new Error("missing order")
    const storageId = await ctx.storage.store(
      new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" })
    )
    return await ctx.db.insert("paymentProofs", {
      eventId: order.eventId,
      attendeeId: order.attendeeId,
      storageId,
      contentType: "application/pdf",
      size: 8,
      sha256: "a".repeat(43) + "=",
      submittedByUserId: userId,
      status: "active",
      createdAt: Date.now(),
    })
  })
}

async function draftFor(
  t: ReturnType<typeof test>,
  event: Awaited<ReturnType<typeof readyEvent>>,
  email: string
) {
  const guest = await user(t, email)
  await guest.client.mutation(api.eventAttendees.startCheckout, {
    shareToken: event.shareToken,
  })
  const orderId = await guest.client.mutation(api.checkout.saveDraft, {
    shareToken: event.shareToken,
    lines: [{ itemId: event.itemId, quantity: 1 }],
    fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
    guestName: "Ada",
  })
  return { guest, orderId, proofId: await proofFor(t, orderId, guest.userId) }
}

function submitArgs(
  event: Awaited<ReturnType<typeof readyEvent>>,
  proofId: string,
  requestId: string
) {
  return {
    shareToken: event.shareToken,
    requestId,
    lines: [{ itemId: event.itemId, quantity: 1 }],
    fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
    proofId: proofId as never,
    guestName: "Ada",
  }
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
    const proofId = await proofFor(t, checkout!.order!._id, guest.userId)
    await expect(
      guest.client.mutation(
        api.checkout.submit,
        submitArgs(event, proofId, "unverified-submit")
      )
    ).rejects.toThrow("Verify your email")
  })

  it("submits once, reserves atomically, and replays a canonically equivalent request", async () => {
    const t = test()
    const event = await readyEvent(t)
    const guest = await user(t, "guest@example.com")
    await guest.client.mutation(api.eventAttendees.startCheckout, {
      shareToken: event.shareToken,
    })
    const draftId = await guest.client.mutation(api.checkout.saveDraft, {
      shareToken: event.shareToken,
      lines: [{ itemId: event.itemId, quantity: 1 }],
      fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
      guestName: "Ada",
    })
    const proofId = await t.run(async (ctx) => {
      const draft = await ctx.db.get(draftId)
      if (!draft) throw new Error("missing draft")
      const storageId = await ctx.storage.store(
        new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" })
      )
      return await ctx.db.insert("paymentProofs", {
        eventId: draft.eventId,
        attendeeId: draft.attendeeId,
        storageId,
        contentType: "application/pdf",
        size: 8,
        sha256: "a".repeat(43) + "=",
        submittedByUserId: guest.userId,
        status: "active",
        createdAt: Date.now(),
      })
    })
    const first = await guest.client.mutation(api.checkout.submit, {
      shareToken: event.shareToken,
      requestId: "replay-key-123",
      lines: [{ itemId: event.itemId, quantity: 1 }],
      fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
      proofId,
      guestName: "Ada",
    })
    const replay = await guest.client.mutation(api.checkout.submit, {
      guestName: "Ada",
      proofId,
      fulfillment: { pickupContact: "Ada", optionId: event.optionId },
      lines: [{ quantity: 1, itemId: event.itemId }],
      requestId: "replay-key-123",
      shareToken: event.shareToken,
    })
    expect(replay).toBe(first)
    await expect(
      guest.client.mutation(api.checkout.submit, {
        shareToken: event.shareToken,
        requestId: "replay-key-123",
        lines: [{ itemId: event.itemId, quantity: 1 }],
        fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
        proofId,
        guestName: "Different",
      })
    ).rejects.toThrow("already used")
    await t.run(async (ctx) => {
      expect((await ctx.db.get(event.itemId))!.reservedQuantity).toBe(1)
      expect((await ctx.db.get(first))!.lifecycle).toBe("submitted")
    })
  })

  it("allows only one concurrent final-unit submission", async () => {
    const t = test()
    const event = await readyEvent(t)
    const first = await draftFor(t, event, "first@example.com")
    const second = await draftFor(t, event, "second@example.com")
    const results = await Promise.allSettled([
      first.guest.client.mutation(
        api.checkout.submit,
        submitArgs(event, first.proofId, "concurrent-first")
      ),
      second.guest.client.mutation(
        api.checkout.submit,
        submitArgs(event, second.proofId, "concurrent-second")
      ),
    ])
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    await t.run(async (ctx) => {
      expect((await ctx.db.get(event.itemId))!.reservedQuantity).toBe(1)
    })
  })

  it("keeps one active order, then clears the pointer and releases exactly once on cancellation", async () => {
    const t = test()
    const event = await readyEvent(t)
    const draft = await draftFor(t, event, "cancel@example.com")
    const orderId = await draft.guest.client.mutation(
      api.checkout.submit,
      submitArgs(event, draft.proofId, "submit-cancel-1")
    )
    await expect(
      draft.guest.client.mutation(
        api.checkout.submit,
        submitArgs(event, draft.proofId, "submit-cancel-2")
      )
    ).rejects.toThrow("active order")
    const cancelled = await draft.guest.client.mutation(
      api.checkout.cancelMine,
      {
        shareToken: event.shareToken,
        requestId: "cancel-order-1",
      }
    )
    expect(cancelled).toBe(orderId)
    expect(
      await draft.guest.client.mutation(api.checkout.cancelMine, {
        shareToken: event.shareToken,
        requestId: "cancel-order-1",
      })
    ).toBe(orderId)
    const replacement = await draft.guest.client.mutation(
      api.checkout.saveDraft,
      {
        shareToken: event.shareToken,
        lines: [{ itemId: event.itemId, quantity: 1 }],
      }
    )
    expect(replacement).not.toBe(orderId)
    await t.run(async (ctx) => {
      expect((await ctx.db.get(event.itemId))!.reservedQuantity).toBe(0)
      const cancelledOrder = await ctx.db.get(orderId)
      expect(cancelledOrder!.reservationState).toBe("released")
      const attendee = await ctx.db.get(cancelledOrder!.attendeeId)
      expect(attendee!.activeOrderId).toBe(replacement)
      const history = await ctx.db
        .query("orderStatusHistory")
        .withIndex("by_orderId_and_createdAt", (q) => q.eq("orderId", orderId))
        .take(10)
      expect(history.some((entry) => entry.lifecycle === "cancelled")).toBe(
        true
      )
      const lines = await ctx.db
        .query("orderLines")
        .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
        .take(10)
      expect(lines.every((line) => line.lifecycle === "cancelled")).toBe(true)
    })
  })

  it("requires a replacement proof only when a pending edit changes its total", async () => {
    const t = test()
    const event = await readyEvent(t)
    const draft = await draftFor(t, event, "update@example.com")
    const orderId = await draft.guest.client.mutation(
      api.checkout.submit,
      submitArgs(event, draft.proofId, "submit-update-1")
    )
    await expect(
      draft.guest.client.mutation(api.checkout.updatePending, {
        ...submitArgs(event, draft.proofId, "update-same-total"),
      })
    ).resolves.toBe(orderId)
    await t.run(async (ctx) => {
      await ctx.db.patch(event.itemId, { priceMinor: 99_999 })
    })
    await expect(
      draft.guest.client.mutation(api.checkout.updatePending, {
        ...submitArgs(event, draft.proofId, "update-changed-total"),
        lines: [{ itemId: event.itemId, quantity: 1 }],
      })
    ).resolves.toBe(orderId)
    await expect(
      draft.guest.client.mutation(api.checkout.updatePending, {
        ...submitArgs(event, draft.proofId, "update-new-line-requires-proof"),
        lines: [{ itemId: event.itemId, quantity: 2 }],
      })
    ).rejects.toThrow("new payment receipt")
  })

  it("returns null for malformed and cross-user confirmation lookups", async () => {
    const t = test()
    const event = await readyEvent(t)
    const draft = await draftFor(t, event, "confirm@example.com")
    const other = await user(t, "other@example.com")
    expect(
      await draft.guest.client.query(api.orders.getMineForConfirmation, {
        orderId: "not-an-order-id",
      })
    ).toBeNull()
    expect(
      await other.client.query(api.orders.getMineForConfirmation, {
        orderId: draft.orderId,
      })
    ).toBeNull()
  })

  it("does not delete an option when a cancelled order precedes an active one", async () => {
    const t = test()
    const event = await readyEvent(t)
    const cancelled = await draftFor(t, event, "cancelled-option@example.com")
    await cancelled.guest.client.mutation(
      api.checkout.submit,
      submitArgs(event, cancelled.proofId, "option-cancelled-submit")
    )
    await cancelled.guest.client.mutation(api.checkout.cancelMine, {
      shareToken: event.shareToken,
      requestId: "option-cancelled-release",
    })
    const active = await draftFor(t, event, "active-option@example.com")
    await active.guest.client.mutation(
      api.checkout.submit,
      submitArgs(event, active.proofId, "option-active-submit")
    )
    await expect(
      event.owner.client.mutation(api.eventSetup.removeFulfillmentOption, {
        optionId: event.optionId,
      })
    ).rejects.toThrow("active order")
  })

  it("keeps reads available after close while blocking guest order writes", async () => {
    const t = test()
    const event = await readyEvent(t)
    const draft = await draftFor(t, event, "closed@example.com")
    const orderId = await draft.guest.client.mutation(
      api.checkout.submit,
      submitArgs(event, draft.proofId, "closed-submit")
    )
    await t.run(async (ctx) => {
      const order = await ctx.db.get(orderId)
      const stored = await ctx.db.get(order!.eventId)
      await ctx.db.patch(stored!._id, {
        status: "closed",
        updatedAt: Date.now(),
      })
    })
    expect(
      await draft.guest.client.query(api.orders.getMine, { orderId })
    ).toMatchObject({
      order: { _id: orderId, lifecycle: "submitted" },
    })
    await expect(
      draft.guest.client.mutation(api.checkout.cancelMine, {
        shareToken: event.shareToken,
        requestId: "closed-cancel",
      })
    ).rejects.toThrow("no longer accepting")
    await expect(
      draft.guest.client.mutation(api.checkout.updatePending, {
        ...submitArgs(event, draft.proofId, "closed-update"),
      })
    ).rejects.toThrow("no longer accepting")
  })

  it("bounds guest contact input before a draft or update write", async () => {
    const t = test()
    const event = await readyEvent(t)
    const guest = await user(t, "length@example.com")
    await guest.client.mutation(api.eventAttendees.startCheckout, {
      shareToken: event.shareToken,
    })
    await expect(
      guest.client.mutation(api.checkout.saveDraft, {
        shareToken: event.shareToken,
        lines: [{ itemId: event.itemId, quantity: 1 }],
        guestName: "a".repeat(161),
      })
    ).rejects.toThrow("name is too long")
  })

  it("rejects another attendee's proof and keeps order reads tenant-isolated", async () => {
    const t = test()
    const event = await readyEvent(t)
    const first = await draftFor(t, event, "proof-owner@example.com")
    const second = await draftFor(t, event, "proof-thief@example.com")
    await expect(
      second.guest.client.mutation(
        api.checkout.submit,
        submitArgs(event, first.proofId, "foreign-proof")
      )
    ).rejects.toThrow("valid payment receipt")
    const orderId = await first.guest.client.mutation(
      api.checkout.submit,
      submitArgs(event, first.proofId, "own-proof")
    )
    expect(
      await second.guest.client.query(api.orders.getMine, { orderId })
    ).toBeNull()
    const page = await second.guest.client.query(api.orders.listMine, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(page.page.map((entry) => entry._id)).not.toContain(orderId)
  })
})
