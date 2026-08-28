/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test"
import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const DAY = 86_400_000

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
  aggregateTest.register(t, "orderPaymentCounts")
  aggregateTest.register(t, "orderValues")
  aggregateTest.register(t, "orderProgressCounts")
  aggregateTest.register(t, "itemDemand")
  return t
}
type Harness = ReturnType<typeof test>

async function user(t: Harness, email: string) {
  const now = Date.now()
  const account = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: email,
        email,
        emailVerified: true,
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
    userId: account._id,
    client: t.withIdentity({ subject: account._id, sessionId: session._id }),
  }
}

async function event(t: Harness, type: "pickup" | "delivery" = "pickup") {
  const owner = await user(t, `owner-${type}@example.com`)
  const eventId = await owner.client.mutation(api.events.create, {
    name: "Event",
    description: "d",
    eventDate: "2027-12-01",
    orderDeadline: "2027-11-01",
    orderDeadlineAt: Date.now() + DAY,
    timeZone: "Africa/Lagos",
    location: "Lagos",
    contact: "Ada",
    currency: "NGN",
  })
  const itemId = await owner.client.mutation(api.items.create, {
    eventId,
    name: "Lace",
    unitLabel: "piece",
    priceMinor: 1000,
    inventoryTotal: 20,
  })
  const optionId = await owner.client.mutation(
    api.eventSetup.createFulfillmentOption,
    {
      eventId,
      name: type,
      type,
      feeMinor: 100,
      instructions: "Bring ID",
      enabled: true,
      requiredFields:
        type === "pickup"
          ? { kind: "pickup", pickupContact: true }
          : {
              kind: "delivery",
              recipientName: true,
              phoneNumber: true,
              address: true,
              availability: false,
              notes: false,
            },
    }
  )
  await owner.client.mutation(api.eventSetup.savePaymentInstructions, {
    eventId,
    instructions: "Pay",
  })
  await owner.client.mutation(api.events.publish, { eventId })
  const published = await owner.client.query(api.events.get, {
    eventId,
    now: Date.now(),
  })
  return {
    owner,
    eventId,
    itemId,
    optionId,
    shareToken: published!.shareToken!,
    type,
  }
}

async function submitted(
  t: Harness,
  setup: Awaited<ReturnType<typeof event>>,
  email: string
) {
  const guest = await user(t, email)
  await guest.client.mutation(api.eventAttendees.startCheckout, {
    shareToken: setup.shareToken,
  })
  const fulfillment =
    setup.type === "pickup"
      ? { optionId: setup.optionId, pickupContact: "Ada" }
      : {
          optionId: setup.optionId,
          recipientName: "Ada",
          phoneNumber: "123",
          address: "Lagos",
        }
  const orderId = await guest.client.mutation(api.checkout.saveDraft, {
    shareToken: setup.shareToken,
    lines: [{ itemId: setup.itemId, quantity: 1 }],
    fulfillment,
    guestName: "Ada",
    guestPhone: "123",
  })
  const proofId = await t.run(async (ctx) => {
    const order = await ctx.db.get(orderId)
    const storageId = await ctx.storage.store(
      new Blob(["proof"], { type: "application/pdf" })
    )
    return await ctx.db.insert("paymentProofs", {
      eventId: order!.eventId,
      attendeeId: order!.attendeeId,
      orderId,
      storageId,
      contentType: "application/pdf",
      size: 5,
      sha256: "a".repeat(43) + "=",
      submittedByUserId: guest.userId,
      status: "active",
      createdAt: Date.now(),
    })
  })
  await guest.client.mutation(api.checkout.submit, {
    shareToken: setup.shareToken,
    requestId: `submit-${email.replace(/[^A-Za-z0-9_-]/g, "-")}`,
    lines: [{ itemId: setup.itemId, quantity: 1 }],
    fulfillment,
    proofId,
    guestName: "Ada",
    guestPhone: "123",
  })
  return { guest, orderId, proofId, fulfillment }
}

async function confirm(
  t: Harness,
  setup: Awaited<ReturnType<typeof event>>,
  orderId: Id<"orders">
) {
  await setup.owner.client.mutation(api.organizerOrders.decidePayment, {
    eventId: setup.eventId,
    orderId,
    decision: "confirmed",
  })
}

describe("organizer orders", () => {
  it("denies anonymous and cross-owner summary, list, detail, decisions, progress, cancellation, exports, backfill, and notification history", async () => {
    const t = test()
    const setup = await event(t)
    const order = await submitted(t, setup, "guest@example.com")
    const other = await user(t, "other@example.com")
    const anonymous = t.withIdentity({})
    await expect(
      anonymous.query(api.organizerOrders.getSummary, {
        eventId: setup.eventId,
      })
    ).rejects.toThrow()
    await expect(
      other.client.query(api.organizerOrders.list, {
        eventId: setup.eventId,
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).rejects.toThrow()
    await expect(
      other.client.query(api.organizerOrders.getDetail, {
        eventId: setup.eventId,
        orderId: order.orderId,
      })
    ).rejects.toThrow()
    await expect(
      other.client.mutation(api.organizerOrders.decidePayment, {
        eventId: setup.eventId,
        orderId: order.orderId,
        decision: "confirmed",
      })
    ).rejects.toThrow()
    await expect(
      other.client.mutation(api.organizerOrders.advanceFulfillment, {
        eventId: setup.eventId,
        orderId: order.orderId,
      })
    ).rejects.toThrow()
    await expect(
      other.client.mutation(api.organizerOrders.cancel, {
        eventId: setup.eventId,
        orderId: order.orderId,
      })
    ).rejects.toThrow()
    await expect(
      other.client.query(api.notifications.listOrderHistory, {
        eventId: setup.eventId,
        orderId: order.orderId,
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).rejects.toThrow()
    await expect(
      t.query(internal.organizerOrders.getExportPage, {
        eventId: setup.eventId,
        cursor: null,
      })
    ).rejects.toThrow()
  })

  it("enforces payment transitions, exact-once release, resubmission, aggregates, and immutable organizer history", async () => {
    const t = test()
    const setup = await event(t)
    const order = await submitted(t, setup, "reject@example.com")
    await setup.owner.client.mutation(api.organizerOrders.decidePayment, {
      eventId: setup.eventId,
      orderId: order.orderId,
      decision: "rejected",
      note: "Unreadable",
    })
    await expect(
      setup.owner.client.mutation(api.organizerOrders.decidePayment, {
        eventId: setup.eventId,
        orderId: order.orderId,
        decision: "confirmed",
      })
    ).rejects.toThrow()
    await t.run(async (ctx) => {
      expect((await ctx.db.get(setup.itemId))!.reservedQuantity).toBe(0)
    })
    const replacement = await t.run(async (ctx) => {
      const stored = await ctx.db.get(order.orderId)
      const storageId = await ctx.storage.store(new Blob(["new"]))
      return await ctx.db.insert("paymentProofs", {
        eventId: setup.eventId,
        attendeeId: stored!.attendeeId,
        orderId: order.orderId,
        storageId,
        contentType: "application/pdf",
        size: 3,
        sha256: "b".repeat(43) + "=",
        submittedByUserId: order.guest.userId,
        status: "active",
        createdAt: Date.now(),
      })
    })
    await order.guest.client.mutation(api.checkout.resubmitRejected, {
      shareToken: setup.shareToken,
      requestId: "resubmit-001",
      lines: [{ itemId: setup.itemId, quantity: 1 }],
      fulfillment: { optionId: setup.optionId, pickupContact: "Ada" },
      proofId: replacement,
      guestName: "Ada",
      guestPhone: "123",
    })
    const summary = await setup.owner.client.query(
      api.organizerOrders.getSummary,
      { eventId: setup.eventId }
    )
    expect(summary).toMatchObject({
      submittedOrderCount: 1,
      paymentsNeedingReview: 1,
      currentOrderValueMinor: 1100,
    })
    await t.run(async (ctx) => {
      expect((await ctx.db.get(setup.itemId))!.reservedQuantity).toBe(1)
      const history = await ctx.db
        .query("orderStatusHistory")
        .withIndex("by_orderId_and_createdAt", (q) =>
          q.eq("orderId", order.orderId)
        )
        .collect()
      expect(
        history.every(
          (entry) => entry.actorUserId && entry.actorRole && entry.createdAt
        )
      ).toBe(true)
      expect(history.some((entry) => entry.paymentStatus === "rejected")).toBe(
        true
      )
    })
  })

  it("allows only the pickup and delivery fulfillment transition matrices and rejects terminal/cancelled transitions", async () => {
    const t = test()
    const pickup = await event(t, "pickup")
    const p = await submitted(t, pickup, "pickup@example.com")
    await confirm(t, pickup, p.orderId)
    for (const progress of ["preparing", "ready_for_pickup", "fulfilled"]) {
      await pickup.owner.client.mutation(
        api.organizerOrders.advanceFulfillment,
        { eventId: pickup.eventId, orderId: p.orderId }
      )
      expect(
        (await pickup.owner.client.query(api.organizerOrders.getDetail, {
          eventId: pickup.eventId,
          orderId: p.orderId,
        }))!.order.progress
      ).toBe(progress)
    }
    await expect(
      pickup.owner.client.mutation(api.organizerOrders.advanceFulfillment, {
        eventId: pickup.eventId,
        orderId: p.orderId,
      })
    ).rejects.toThrow()
    await expect(
      pickup.owner.client.mutation(api.organizerOrders.cancel, {
        eventId: pickup.eventId,
        orderId: p.orderId,
      })
    ).rejects.toThrow()
    const delivery = await event(t, "delivery")
    const d = await submitted(t, delivery, "delivery@example.com")
    await confirm(t, delivery, d.orderId)
    for (const progress of ["preparing", "dispatched", "fulfilled"]) {
      await delivery.owner.client.mutation(
        api.organizerOrders.advanceFulfillment,
        { eventId: delivery.eventId, orderId: d.orderId }
      )
      expect(
        (await delivery.owner.client.query(api.organizerOrders.getDetail, {
          eventId: delivery.eventId,
          orderId: d.orderId,
        }))!.order.progress
      ).toBe(progress)
    }
  })

  it("uses the same filters for list/export across source pages and backfills pre-component rows idempotently", async () => {
    const t = test()
    const setup = await event(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(setup.itemId, { inventoryTotal: 30 })
    })
    for (let index = 0; index < 27; index++)
      await submitted(t, setup, `page-${index}@example.com`)
    const listed = await setup.owner.client.query(api.organizerOrders.list, {
      eventId: setup.eventId,
      itemId: setup.itemId,
      paymentStatus: "pending_review",
      fulfillmentType: "pickup",
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(listed.page).toHaveLength(20)
    expect(listed.continueCursor).toBeTruthy()
    const second = await setup.owner.client.query(api.organizerOrders.list, {
      eventId: setup.eventId,
      itemId: setup.itemId,
      paymentStatus: "pending_review",
      fulfillmentType: "pickup",
      paginationOpts: { cursor: listed.continueCursor, numItems: 20 },
    })
    expect(second.page).toHaveLength(7)
    const exported = await setup.owner.client.query(
      internal.organizerOrders.getExportPage,
      {
        eventId: setup.eventId,
        cursor: null,
        itemId: setup.itemId,
        paymentStatus: "pending_review",
        fulfillmentType: "pickup",
      }
    )
    expect(exported.rows).toHaveLength(25)
    expect(exported.isDone).toBe(false)
    const backfill = await t.mutation(
      internal.organizerOrderAggregateBackfill.backfillPage,
      { cursor: null }
    )
    expect(backfill.orders).toBeGreaterThan(0)
    await expect(
      t.mutation(internal.organizerOrderAggregateBackfill.backfillPage, {
        cursor: null,
      })
    ).resolves.toMatchObject({ orders: backfill.orders })
  })
})
