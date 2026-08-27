/// <reference types="vite/client" />

import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, components } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

type TestHarness = ReturnType<typeof createTest>
type TestClient = ReturnType<TestHarness["withIdentity"]>

const validEvent = {
  name: "Ada and Tunde",
  description: "Wedding celebration",
  eventDate: "2026-12-12",
  orderDeadline: "2026-11-30",
  location: "Lagos",
  contact: "organizer@example.com",
  currency: "NGN",
}

const validItem = {
  name: "Emerald lace",
  description: "Intricate lace in the event color.",
  unitLabel: "5-yard bundle",
  priceMinor: 85_000_00,
  inventoryTotal: 24,
}

function createTest() {
  const t = convexTest(schema, modules)
  betterAuthTest.register(t)
  return t
}

async function createUser(
  t: TestHarness,
  email: string
): Promise<{ client: TestClient; userId: string }> {
  const now = Date.now()
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: "Event owner",
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
        userId: user._id,
        token: `token-${email}`,
        expiresAt: now + 3_600_000,
        createdAt: now,
        updatedAt: now,
      },
    },
  })

  return {
    client: t.withIdentity({
      subject: user._id,
      sessionId: session._id,
    }),
    userId: user._id,
  }
}

async function createEvent(client: TestClient) {
  return await client.mutation(api.events.create, validEvent)
}

describe("event management", () => {
  it("normalizes create and update while preserving ownership and status", async () => {
    const t = createTest()
    const { client, userId } = await createUser(t, "owner@example.com")
    const eventId = await client.mutation(api.events.create, {
      ...validEvent,
      name: "  Ada and Tunde  ",
      description: "  Wedding celebration  ",
      location: "  Lagos  ",
      contact: "  organizer@example.com  ",
      currency: "  NGN  ",
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { updatedAt: 1 })
    })

    await client.mutation(api.events.update, {
      eventId,
      name: "  Ada, Tunde, and family  ",
      description: "  Updated celebration details  ",
      eventDate: "  2027-01-09  ",
      orderDeadline: "  2026-12-20  ",
      location: "  Abuja  ",
      contact: "  events@example.com  ",
      currency: "  USD  ",
    })

    const event = await client.query(api.events.get, {
      eventId,
      now: Date.now(),
    })
    expect(event).toMatchObject({
      name: "Ada, Tunde, and family",
      description: "Updated celebration details",
      eventDate: "2027-01-09",
      orderDeadline: "2026-12-20",
      location: "Abuja",
      contact: "events@example.com",
      currency: "USD",
      status: "draft",
      hasCatalogItems: false,
    })
    expect(event?.updatedAt).toBeGreaterThan(1)

    const stored = await t.run(async (ctx) => ctx.db.get(eventId))
    expect(stored).toMatchObject({ ownerId: userId, status: "draft" })
  })

  it.each([
    [{ ...validEvent, name: "   " }, "Complete all event details"],
    [{ ...validEvent, eventDate: "December 12" }, "event date"],
    [{ ...validEvent, currency: "EUR" }, "supported currency"],
  ])(
    "rejects invalid updates without changing the event",
    async (input, message) => {
      const t = createTest()
      const { client } = await createUser(t, `owner-${message}@example.com`)
      const eventId = await createEvent(client)

      await expect(
        client.mutation(api.events.update, { eventId, ...input })
      ).rejects.toThrow(message)

      const event = await client.query(api.events.get, {
        eventId,
        now: Date.now(),
      })
      expect(event).toMatchObject(validEvent)
    }
  )

  it("derives catalog presence and locks currency after the first item", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)

    await expect(
      client.query(api.events.get, { eventId, now: Date.now() })
    ).resolves.toMatchObject({ hasCatalogItems: false })

    await client.mutation(api.items.create, { eventId, ...validItem })

    await expect(
      client.query(api.events.get, { eventId, now: Date.now() })
    ).resolves.toMatchObject({ hasCatalogItems: true })
    await expect(
      client.mutation(api.events.update, {
        eventId,
        ...validEvent,
        currency: "USD",
      })
    ).rejects.toThrow(
      "Currency cannot be changed after catalog items are added"
    )

    await expect(
      client.mutation(api.events.update, {
        eventId,
        ...validEvent,
        name: "Updated name",
      })
    ).resolves.toBeNull()
    await expect(
      client.query(api.events.get, { eventId, now: Date.now() })
    ).resolves.toMatchObject({
      name: "Updated name",
      currency: "NGN",
      hasCatalogItems: true,
    })
  })

  it("updates non-archived events without changing their lifecycle status", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { status: "published" })
    })

    await client.mutation(api.events.update, {
      eventId,
      ...validEvent,
      name: "Published event update",
    })

    await expect(
      client.query(api.events.get, { eventId, now: Date.now() })
    ).resolves.toMatchObject({
      name: "Published event update",
      status: "published",
    })
  })

  it("rejects archived event updates", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { status: "archived" })
    })

    await expect(
      client.mutation(api.events.update, {
        eventId,
        ...validEvent,
        name: "Disallowed update",
      })
    ).rejects.toThrow("Archived events are read-only")
  })

  it("denies updates to missing and other owners' events", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: stranger } = await createUser(t, "stranger@example.com")
    const eventId = await createEvent(owner)

    await expect(
      stranger.mutation(api.events.update, {
        eventId,
        ...validEvent,
        name: "Hijacked event",
      })
    ).rejects.toThrow("Event not found")

    const missingEventId = await createEvent(owner)
    await t.run(async (ctx) => {
      await ctx.db.delete(missingEventId)
    })
    await expect(
      owner.mutation(api.events.update, {
        eventId: missingEventId,
        ...validEvent,
      })
    ).rejects.toThrow("Event not found")

    await expect(
      owner.query(api.events.get, { eventId, now: Date.now() })
    ).resolves.toMatchObject({ name: validEvent.name })
  })

  it("atomically removes a draft and its catalog and is idempotent", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await client.mutation(api.items.create, {
      eventId,
      ...validItem,
      name: "First item",
    })
    await client.mutation(api.items.create, {
      eventId,
      ...validItem,
      name: "Second item",
    })

    await expect(
      client.mutation(api.events.remove, { eventId })
    ).resolves.toBeNull()

    const remaining = await t.run(async (ctx) => ({
      event: await ctx.db.get(eventId),
      items: await ctx.db
        .query("items")
        .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
        .collect(),
    }))
    expect(remaining).toEqual({ event: null, items: [] })
    await expect(
      client.mutation(api.events.remove, { eventId })
    ).resolves.toBeNull()
  })

  it("treats another owner's removal request as a no-op", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: stranger } = await createUser(t, "stranger@example.com")
    const eventId = await createEvent(owner)
    const itemId = await owner.mutation(api.items.create, {
      eventId,
      ...validItem,
    })

    await expect(
      stranger.mutation(api.events.remove, { eventId })
    ).resolves.toBeNull()

    const retained = await t.run(async (ctx) => ({
      event: await ctx.db.get(eventId),
      item: await ctx.db.get(itemId),
    }))
    expect(retained.event).not.toBeNull()
    expect(retained.item).not.toBeNull()
  })

  it.each(["published", "closed", "archived"] as const)(
    "retains a %s event when permanent removal is attempted",
    async (status) => {
      const t = createTest()
      const { client } = await createUser(t, `${status}@example.com`)
      const eventId = await createEvent(client)
      const itemId = await client.mutation(api.items.create, {
        eventId,
        ...validItem,
      })
      await t.run(async (ctx) => {
        await ctx.db.patch(eventId, { status })
      })

      await expect(
        client.mutation(api.events.remove, { eventId })
      ).rejects.toThrow("Only draft events can be deleted")

      const retained = await t.run(async (ctx) => ({
        event: await ctx.db.get(eventId),
        item: await ctx.db.get(itemId),
      }))
      expect(retained.event?.status).toBe(status)
      expect(retained.item).not.toBeNull()
    }
  )
})
