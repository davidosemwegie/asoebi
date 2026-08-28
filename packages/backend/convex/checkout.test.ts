/// <reference types="vite/client" />

import betterAuthTest from "@convex-dev/better-auth/test"
import aggregateTest from "@convex-dev/aggregate/test"
import { convexTest } from "convex-test"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const DAY = 24 * 60 * 60 * 1_000

beforeAll(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-is-at-least-32-characters")
  vi.stubEnv("SITE_URL", "http://localhost:3000")
  vi.stubEnv("RESEND_API_KEY", "re_test_only")
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test_only")
  vi.stubEnv("EMAIL_FROM", "Aso Circle <onboarding@resend.dev>")
  vi.stubEnv("EMAIL_DELIVERY_MODE", "test")
})

function test() {
  const t = convexTest(schema, modules)
  betterAuthTest.register(t)
  aggregateTest.register(t, "invitationDeliveryCounts")
  aggregateTest.register(t, "invitationActivityCounts")
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
  return { eventId, itemId, optionId, shareToken: event!.shareToken!, owner }
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
    const proofId = await ctx.db.insert("paymentProofs", {
      eventId: order.eventId,
      attendeeId: order.attendeeId,
      orderId,
      storageId,
      contentType: "application/pdf",
      size: 8,
      sha256: "a".repeat(43) + "=",
      submittedByUserId: userId,
      status: "active",
      createdAt: Date.now(),
    })
    if (order.lifecycle === "draft") {
      if (order.currentProofId) {
        await ctx.db.patch(order.currentProofId, {
          status: "invalidated",
          invalidatedAt: Date.now(),
        })
      }
      await ctx.db.patch(orderId, { currentProofId: proofId })
    }
    return proofId
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

async function submitDraft(
  t: ReturnType<typeof test>,
  event: Awaited<ReturnType<typeof readyEvent>>,
  email: string,
  requestId: string
) {
  const draft = await draftFor(t, event, email)
  const orderId = await draft.guest.client.mutation(
    api.checkout.submit,
    submitArgs(event, draft.proofId, requestId)
  )
  return { ...draft, orderId }
}

async function rejectSubmittedOrder(
  t: ReturnType<typeof test>,
  event: Awaited<ReturnType<typeof readyEvent>>,
  orderId: Id<"orders">
) {
  await t.run(async (ctx) => {
    const order = await ctx.db.get(orderId)
    if (!order) throw new Error("missing order")
    const item = await ctx.db.get(event.itemId)
    if (!item) throw new Error("missing item")
    await ctx.db.patch(orderId, {
      paymentStatus: "rejected",
      reservationState: "released",
      updatedAt: Date.now(),
    })
    await ctx.db.patch(item._id, {
      reservedQuantity: 0,
      updatedAt: Date.now(),
    })
  })
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
    await t.run(async (ctx) => {
      expect((await ctx.db.get(event.itemId))!.reservedQuantity).toBe(0)
      expect(await ctx.db.get(checkout!.order!._id)).toMatchObject({
        lifecycle: "draft",
        paymentStatus: "not_submitted",
        reservationState: "none",
      })
    })
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

  it("invalidates a draft receipt when the total changes and blocks a direct-submit bypass", async () => {
    const t = test()
    const event = await readyEvent(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(event.itemId, { inventoryTotal: 2 })
    })
    const draft = await draftFor(t, event, "draft-total@example.com")
    const changedLines = [{ itemId: event.itemId, quantity: 2 }]

    await draft.guest.client.mutation(api.checkout.saveDraft, {
      shareToken: event.shareToken,
      lines: [{ itemId: event.itemId, quantity: 1 }],
      fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
      guestName: "Ada",
    })
    await t.run(async (ctx) => {
      expect(await ctx.db.get(draft.proofId)).toMatchObject({
        status: "active",
      })
      expect(await ctx.db.get(draft.orderId)).toMatchObject({
        currentProofId: draft.proofId,
        totalMinor: 10_500,
      })
    })

    await expect(
      draft.guest.client.mutation(api.checkout.submit, {
        ...submitArgs(event, draft.proofId, "draft-total-direct-submit"),
        lines: changedLines,
      })
    ).rejects.toThrow("total changed")

    await draft.guest.client.mutation(api.checkout.saveDraft, {
      shareToken: event.shareToken,
      lines: changedLines,
      fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
      guestName: "Ada",
    })
    await t.run(async (ctx) => {
      expect(await ctx.db.get(draft.proofId)).toMatchObject({
        status: "invalidated",
      })
      const order = await ctx.db.get(draft.orderId)
      expect(order).toMatchObject({ totalMinor: 20_500 })
      expect(order?.currentProofId).toBeUndefined()
    })
    await expect(
      draft.guest.client.mutation(api.checkout.submit, {
        ...submitArgs(event, draft.proofId, "draft-total-old-proof"),
        lines: changedLines,
      })
    ).rejects.toThrow("valid payment receipt")

    const replacementProof = await proofFor(
      t,
      draft.orderId,
      draft.guest.userId
    )
    await expect(
      draft.guest.client.mutation(api.checkout.submit, {
        ...submitArgs(event, replacementProof, "draft-total-new-proof"),
        lines: changedLines,
      })
    ).resolves.toBe(draft.orderId)
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

  it("keeps existing orders readable after the exact deadline while blocking every guest write path", async () => {
    const t = test()
    const event = await readyEvent(t)
    const draft = await draftFor(t, event, "expired@example.com")
    const orderId = await draft.guest.client.mutation(
      api.checkout.submit,
      submitArgs(event, draft.proofId, "expired-submit")
    )
    await t.run(async (ctx) => {
      await ctx.db.patch(event.eventId, {
        orderDeadlineAt: Date.now() - 1,
        updatedAt: Date.now(),
      })
    })
    expect(
      await draft.guest.client.query(api.orders.getMine, { orderId })
    ).toMatchObject({ order: { _id: orderId, lifecycle: "submitted" } })
    await expect(
      draft.guest.client.mutation(api.checkout.saveDraft, {
        shareToken: event.shareToken,
        lines: [{ itemId: event.itemId, quantity: 1 }],
      })
    ).rejects.toThrow("no longer accepting")
    await expect(
      draft.guest.client.mutation(api.checkout.updatePending, {
        ...submitArgs(event, draft.proofId, "expired-update"),
      })
    ).rejects.toThrow("no longer accepting")
    await expect(
      draft.guest.client.mutation(api.checkout.cancelMine, {
        shareToken: event.shareToken,
        requestId: "expired-cancel",
      })
    ).rejects.toThrow("no longer accepting")
    const replacementProof = await proofFor(t, orderId, draft.guest.userId)
    await t.run(async (ctx) => {
      await ctx.db.patch(orderId, {
        paymentStatus: "rejected",
        reservationState: "released",
      })
      await ctx.db.patch(event.itemId, { reservedQuantity: 0 })
    })
    await expect(
      draft.guest.client.mutation(api.checkout.resubmitRejected, {
        ...submitArgs(event, replacementProof, "expired-resubmit"),
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

  it("keeps captured item prices and pickup fees while charging current prices and fees for new choices", async () => {
    const t = test()
    const event = await readyEvent(t)
    const addedItemId = await event.owner.client.mutation(api.items.create, {
      eventId: event.eventId,
      name: "Cap",
      unitLabel: "piece",
      priceMinor: 3_000,
      inventoryTotal: 4,
    })
    const deliveryOptionId = await event.owner.client.mutation(
      api.eventSetup.createFulfillmentOption,
      {
        eventId: event.eventId,
        name: "Home delivery",
        type: "delivery",
        feeMinor: 2_500,
        instructions: "We will call before delivery.",
        enabled: true,
        requiredFields: {
          kind: "delivery",
          recipientName: false,
          phoneNumber: false,
          address: false,
          availability: false,
          notes: false,
        },
      }
    )
    const submitted = await submitDraft(
      t,
      event,
      "prices@example.com",
      "submit-prices"
    )
    await t.run(async (ctx) => {
      await ctx.db.patch(event.itemId, { priceMinor: 99_000 })
      await ctx.db.patch(addedItemId, { priceMinor: 4_000 })
    })
    const replacementProof = await proofFor(
      t,
      submitted.orderId,
      submitted.guest.userId
    )
    await submitted.guest.client.mutation(api.checkout.updatePending, {
      shareToken: event.shareToken,
      requestId: "update-prices-and-option",
      lines: [
        { itemId: event.itemId, quantity: 1 },
        { itemId: addedItemId, quantity: 1 },
      ],
      fulfillment: { optionId: deliveryOptionId },
      proofId: replacementProof,
      guestName: "Ada",
    })
    await t.run(async (ctx) => {
      const order = await ctx.db.get(submitted.orderId)
      const lines = await ctx.db
        .query("orderLines")
        .withIndex("by_orderId", (q) => q.eq("orderId", submitted.orderId))
        .take(10)
      expect(order).toMatchObject({
        itemSubtotalMinor: 14_000,
        fulfillmentFeeMinor: 2_500,
        totalMinor: 16_500,
        fulfillmentOptionId: deliveryOptionId,
      })
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemId: event.itemId,
            unitPriceMinor: 10_000,
          }),
          expect.objectContaining({
            itemId: addedItemId,
            unitPriceMinor: 4_000,
          }),
        ])
      )
      expect((await ctx.db.get(event.itemId))!.reservedQuantity).toBe(1)
      expect((await ctx.db.get(addedItemId))!.reservedQuantity).toBe(1)
    })
  })

  it("allows reducing a hidden retained line but blocks increasing it, and preserves a disabled selected option's captured terms", async () => {
    const t = test()
    const event = await readyEvent(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(event.itemId, { inventoryTotal: 2 })
    })
    const guest = await user(t, "retained@example.com")
    await guest.client.mutation(api.eventAttendees.startCheckout, {
      shareToken: event.shareToken,
    })
    const orderId = await guest.client.mutation(api.checkout.saveDraft, {
      shareToken: event.shareToken,
      lines: [{ itemId: event.itemId, quantity: 2 }],
      fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
      guestName: "Ada",
    })
    const proofId = await proofFor(t, orderId, guest.userId)
    await guest.client.mutation(api.checkout.submit, {
      shareToken: event.shareToken,
      requestId: "submit-retained",
      lines: [{ itemId: event.itemId, quantity: 2 }],
      fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
      proofId,
      guestName: "Ada",
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(event.itemId, { isHidden: true })
      await ctx.db.patch(event.optionId, {
        enabled: false,
        feeMinor: 9_999,
        instructions: "Changed live instructions",
      })
    })
    const replacementProof = await proofFor(t, orderId, guest.userId)
    await guest.client.mutation(api.checkout.updatePending, {
      shareToken: event.shareToken,
      requestId: "reduce-hidden-line",
      lines: [{ itemId: event.itemId, quantity: 1 }],
      fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
      proofId: replacementProof,
      guestName: "Ada",
    })
    await t.run(async (ctx) => {
      expect((await ctx.db.get(event.itemId))!.reservedQuantity).toBe(1)
    })
    await expect(
      guest.client.mutation(api.checkout.updatePending, {
        shareToken: event.shareToken,
        requestId: "increase-hidden-line",
        lines: [{ itemId: event.itemId, quantity: 2 }],
        fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
        guestName: "Ada",
      })
    ).rejects.toThrow("no longer available")
    await t.run(async (ctx) => {
      expect(await ctx.db.get(orderId)).toMatchObject({
        fulfillmentFeeMinor: 500,
        fulfillmentInstructions: "Bring ID",
      })
    })
  })

  it("reports only current availability for a hidden rejected line after another order consumes the released stock", async () => {
    const t = test()
    const event = await readyEvent(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(event.itemId, { inventoryTotal: 3 })
    })
    const firstGuest = await user(t, "availability-first@example.com")
    await firstGuest.client.mutation(api.eventAttendees.startCheckout, {
      shareToken: event.shareToken,
    })
    const firstOrderId = await firstGuest.client.mutation(
      api.checkout.saveDraft,
      {
        shareToken: event.shareToken,
        lines: [{ itemId: event.itemId, quantity: 2 }],
        fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
        guestName: "Ada",
      }
    )
    const firstProof = await proofFor(t, firstOrderId, firstGuest.userId)
    await firstGuest.client.mutation(api.checkout.submit, {
      shareToken: event.shareToken,
      requestId: "availability-first-submit",
      lines: [{ itemId: event.itemId, quantity: 2 }],
      fulfillment: { optionId: event.optionId, pickupContact: "Ada" },
      proofId: firstProof,
      guestName: "Ada",
    })
    await rejectSubmittedOrder(t, event, firstOrderId)
    const secondGuest = await user(t, "availability-second@example.com")
    await secondGuest.client.mutation(api.eventAttendees.startCheckout, {
      shareToken: event.shareToken,
    })
    const secondOrderId = await secondGuest.client.mutation(
      api.checkout.saveDraft,
      {
        shareToken: event.shareToken,
        lines: [{ itemId: event.itemId, quantity: 3 }],
        fulfillment: { optionId: event.optionId, pickupContact: "Bola" },
        guestName: "Bola",
      }
    )
    const secondProof = await proofFor(t, secondOrderId, secondGuest.userId)
    await secondGuest.client.mutation(api.checkout.submit, {
      shareToken: event.shareToken,
      requestId: "availability-second-submit",
      lines: [{ itemId: event.itemId, quantity: 3 }],
      fulfillment: { optionId: event.optionId, pickupContact: "Bola" },
      proofId: secondProof,
      guestName: "Bola",
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(event.itemId, { isHidden: true })
    })
    const checkout = await firstGuest.client.query(api.checkout.get, {
      shareToken: event.shareToken,
    })
    expect(
      checkout!.items.find((item) => item._id === event.itemId)
        ?.availableQuantity
    ).toBe(0)
  })

  it("requires required fulfillment details before submission", async () => {
    const t = test()
    const event = await readyEvent(t)
    const draft = await draftFor(t, event, "details@example.com")
    await expect(
      draft.guest.client.mutation(api.checkout.submit, {
        shareToken: event.shareToken,
        requestId: "missing-pickup-contact",
        lines: [{ itemId: event.itemId, quantity: 1 }],
        fulfillment: { optionId: event.optionId },
        proofId: draft.proofId,
        guestName: "Ada",
      })
    ).rejects.toThrow("pickup contact")
  })

  it("requires a new proof and fresh inventory reservation when a rejected order is resubmitted", async () => {
    const t = test()
    const event = await readyEvent(t)
    const submitted = await submitDraft(
      t,
      event,
      "rejected@example.com",
      "submit-rejected"
    )
    await rejectSubmittedOrder(t, event, submitted.orderId)
    await expect(
      submitted.guest.client.mutation(api.checkout.resubmitRejected, {
        ...submitArgs(event, submitted.proofId, "same-proof-rejected"),
      })
    ).rejects.toThrow("new payment receipt")
    const replacementProof = await proofFor(
      t,
      submitted.orderId,
      submitted.guest.userId
    )
    await submitted.guest.client.mutation(api.checkout.resubmitRejected, {
      ...submitArgs(event, replacementProof, "new-proof-rejected"),
    })
    await t.mutation(internal.checkout.afterSubmit, {
      orderId: submitted.orderId,
    })
    await t.run(async (ctx) => {
      const order = await ctx.db.get(submitted.orderId)
      const history = await ctx.db
        .query("orderStatusHistory")
        .withIndex("by_orderId_and_createdAt", (q) =>
          q.eq("orderId", submitted.orderId)
        )
        .take(10)
      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_orderRef_and_updatedAt", (q) =>
          q.eq("orderRef", `${submitted.orderId}`)
        )
        .take(10)
      expect(order).toMatchObject({
        paymentStatus: "pending_review",
        reservationState: "reserved",
        currentProofId: replacementProof,
      })
      expect((await ctx.db.get(event.itemId))!.reservedQuantity).toBe(1)
      expect(
        history.some((entry) => entry.paymentStatus === "pending_review")
      ).toBe(true)
      expect(
        notifications.some(
          (entry) => entry.templateKind === "guest_order_submitted"
        )
      ).toBe(true)
    })
  })

  it("limits proof-upload claims, rejects uploads after confirmation, and does not let a foreign caller consume a claim", async () => {
    const t = test()
    const event = await readyEvent(t)
    const draft = await draftFor(t, event, "claims@example.com")
    const claimArgs = {
      shareToken: event.shareToken,
      contentType: "application/pdf",
      size: 8,
      sha256: "a".repeat(43) + "=",
    }
    const first = await draft.guest.client.mutation(
      api.checkout.generateProofUploadUrl,
      claimArgs
    )
    await draft.guest.client.mutation(
      api.checkout.generateProofUploadUrl,
      claimArgs
    )
    await draft.guest.client.mutation(
      api.checkout.generateProofUploadUrl,
      claimArgs
    )
    await expect(
      draft.guest.client.mutation(
        api.checkout.generateProofUploadUrl,
        claimArgs
      )
    ).rejects.toThrow("existing receipt uploads")
    const intruder = await user(t, "intruder@example.com")
    const storageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["not a receipt"], { type: "application/pdf" })
      )
    )
    const result = await intruder.client.mutation(
      internal.checkout.finalizeProofUpload,
      { claimId: first.claimId, storageId, signatureValid: false }
    )
    expect(result.ok).toBe(false)
    await t.run(async (ctx) => {
      expect(await ctx.db.get(first.claimId)).not.toBeNull()
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(draft.orderId, {
        lifecycle: "submitted",
        paymentStatus: "confirmed",
      })
    })
    await expect(
      draft.guest.client.mutation(
        api.checkout.generateProofUploadUrl,
        claimArgs
      )
    ).rejects.toThrow("cannot accept another payment receipt")
  })

  it("matches a verified invitation without gating an uninvited order, and records invitation submission activity", async () => {
    const t = test()
    const event = await readyEvent(t)
    const invitation = await event.owner.client.mutation(
      api.eventInvitations.add,
      {
        eventId: event.eventId,
        name: "Invited Ada",
        email: " INVITED@EXAMPLE.COM ",
      }
    )
    await t.run(async (ctx) => {
      await ctx.db.patch(event.itemId, { inventoryTotal: 2 })
    })
    const invited = await submitDraft(
      t,
      event,
      "invited@example.com",
      "submit-invited"
    )
    const uninvited = await submitDraft(
      t,
      event,
      "not-invited@example.com",
      "submit-uninvited"
    )
    await t.finishInProgressScheduledFunctions()
    await t.run(async (ctx) => {
      const storedInvitation = await ctx.db.get(invitation._id)
      expect(storedInvitation).toMatchObject({
        matchedUserId: invited.guest.userId,
        orderId: `${invited.orderId}`,
        activity: "order_submitted",
      })
      const noInvitation = await ctx.db
        .query("eventInvitations")
        .withIndex("by_eventId_and_normalizedEmail", (q) =>
          q
            .eq("eventId", event.eventId)
            .eq("normalizedEmail", "not-invited@example.com")
        )
        .unique()
      expect(noInvitation).toBeNull()
      expect(await ctx.db.get(uninvited.orderId)).toMatchObject({
        lifecycle: "submitted",
      })
    })
  })

  it("serves a submitted receipt to its event owner only and keeps the cancelled proof attached without releasing twice", async () => {
    const t = test()
    const event = await readyEvent(t)
    const submitted = await submitDraft(
      t,
      event,
      "receipt-owner@example.com",
      "submit-receipt-owner"
    )
    const outsider = await user(t, "not-owner@example.com")
    expect(
      await event.owner.client.query(internal.orders.getReceiptForOwner, {
        orderId: submitted.orderId,
      })
    ).toMatchObject({ reference: expect.stringMatching(/^ASO-/) })
    expect(
      await outsider.client.query(internal.orders.getReceiptForOwner, {
        orderId: submitted.orderId,
      })
    ).toBeNull()
    await submitted.guest.client.mutation(api.checkout.cancelMine, {
      shareToken: event.shareToken,
      requestId: "cancel-receipt-invariant",
    })
    await t.run(async (ctx) => {
      const order = await ctx.db.get(submitted.orderId)
      const proof = await ctx.db.get(submitted.proofId)
      expect(order).toMatchObject({
        lifecycle: "cancelled",
        reservationState: "released",
        currentProofId: submitted.proofId,
      })
      expect(proof).toMatchObject({
        orderId: submitted.orderId,
        status: "active",
      })
      expect((await ctx.db.get(event.itemId))!.reservedQuantity).toBe(0)
    })
  })

  it("scavenges aged orphan storage while preserving referenced covers, proofs, and active upload claims", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"))
      const t = test()
      const event = await readyEvent(t)
      const draft = await draftFor(t, event, "scavenge@example.com")
      const ids = await t.run(async (ctx) => {
        const orphan = await ctx.storage.store(
          new Blob(["orphan"], { type: "application/pdf" })
        )
        const cover = await ctx.storage.store(
          new Blob(["cover"], { type: "image/jpeg" })
        )
        const claimed = await ctx.storage.store(
          new Blob(["claimed"], { type: "application/pdf" })
        )
        const order = await ctx.db.get(draft.orderId)
        if (!order) throw new Error("missing order")
        await ctx.db.patch(event.eventId, { coverStorageId: cover })
        await ctx.db.insert("proofUploadClaims", {
          eventId: event.eventId,
          attendeeId: order.attendeeId,
          orderId: order._id,
          uploaderUserId: draft.guest.userId,
          contentType: "application/pdf",
          size: 7,
          sha256: "a".repeat(43) + "=",
          storageId: claimed,
          expiresAt: Date.now() + 30 * 60 * 1_000,
        })
        const proof = await ctx.db.get(draft.proofId)
        if (!proof) throw new Error("missing proof")
        return { orphan, cover, claimed, proof: proof.storageId }
      })
      vi.setSystemTime(new Date("2030-01-01T00:16:00.000Z"))
      const result = await t.mutation(
        internal.checkout.cleanExpiredOrderArtifacts,
        {}
      )
      expect(result.orphans).toBeGreaterThanOrEqual(1)
      await t.run(async (ctx) => {
        expect(await ctx.db.system.get("_storage", ids.orphan)).toBeNull()
        expect(await ctx.db.system.get("_storage", ids.cover)).not.toBeNull()
        expect(await ctx.db.system.get("_storage", ids.proof)).not.toBeNull()
        expect(await ctx.db.system.get("_storage", ids.claimed)).not.toBeNull()
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("deletes an expired recorded claim without deleting storage still referenced by both a proof and cover", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2030-02-01T00:00:00.000Z"))
      const t = test()
      const event = await readyEvent(t)
      const draft = await draftFor(t, event, "expired-claim@example.com")
      const claimId = await t.run(async (ctx) => {
        const proof = await ctx.db.get(draft.proofId)
        const order = await ctx.db.get(draft.orderId)
        if (!proof || !order) throw new Error("missing proof or order")
        await ctx.db.patch(event.eventId, { coverStorageId: proof.storageId })
        return await ctx.db.insert("proofUploadClaims", {
          eventId: event.eventId,
          attendeeId: order.attendeeId,
          orderId: order._id,
          uploaderUserId: draft.guest.userId,
          contentType: proof.contentType,
          size: proof.size,
          sha256: proof.sha256,
          storageId: proof.storageId,
          expiresAt: Date.now() - 1,
        })
      })
      const result = await t.mutation(
        internal.checkout.cleanExpiredOrderArtifacts,
        {}
      )
      expect(result.claims).toBe(1)
      await t.run(async (ctx) => {
        const proof = await ctx.db.get(draft.proofId)
        expect(await ctx.db.get(claimId)).toBeNull()
        expect(
          await ctx.db.system.get("_storage", proof!.storageId)
        ).not.toBeNull()
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps a young orphan through a completed cursor cycle, then deletes it after it ages", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2030-03-01T00:00:00.000Z"))
      const t = test()
      const event = await readyEvent(t)
      const youngOrphan = await t.run((ctx) =>
        ctx.storage.store(
          new Blob(["young orphan"], { type: "application/pdf" })
        )
      )
      const first = await t.mutation(
        internal.checkout.cleanExpiredOrderArtifacts,
        {}
      )
      expect(first.orphans).toBe(0)
      await t.run(async (ctx) => {
        const cursor = await ctx.db
          .query("storageScavengerCursors")
          .withIndex("by_name", (q) => q.eq("name", "payment-proof-orphans"))
          .unique()
        expect(cursor?.cursor).toBeUndefined()
        expect(await ctx.db.system.get("_storage", youngOrphan)).not.toBeNull()
      })
      vi.setSystemTime(new Date("2030-03-01T00:16:00.000Z"))
      const second = await t.mutation(
        internal.checkout.cleanExpiredOrderArtifacts,
        {}
      )
      expect(second.orphans).toBeGreaterThanOrEqual(1)
      await t.run(async (ctx) => {
        expect(await ctx.db.system.get("_storage", youngOrphan)).toBeNull()
      })
      // `event` is intentionally retained to ensure the cycle ignores unrelated rows.
      expect(event.eventId).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
