/// <reference types="vite/client" />

import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, components } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
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
        name: "Catalog owner",
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

async function seedItem(
  t: TestHarness,
  eventId: Id<"events">,
  sortOrder: number
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("items", {
      eventId,
      name: `Item ${sortOrder + 1}`,
      unitLabel: "bundle",
      priceMinor: 1_000,
      inventoryTotal: 10,
      reservedQuantity: 0,
      isHidden: false,
      sortOrder,
      updatedAt: Date.now(),
    })
  )
}

describe("organizer catalog", () => {
  it("creates, normalizes, and lists free and zero-inventory items", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)

    const itemId = await client.mutation(api.items.create, {
      eventId,
      name: "  Free swatch  ",
      description: "   ",
      unitLabel: "  swatch  ",
      priceMinor: 0,
      inventoryTotal: 0,
    })

    const items = await client.query(api.items.listForOwner, { eventId })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      _id: itemId,
      name: "Free swatch",
      unitLabel: "swatch",
      priceMinor: 0,
      inventoryTotal: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      isHidden: false,
      sortOrder: 0,
    })
    expect(items[0]).not.toHaveProperty("description")
  })

  it("denies every catalog operation across owners", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: stranger } = await createUser(t, "stranger@example.com")
    const eventId = await createEvent(owner)
    const itemId = await owner.mutation(api.items.create, {
      eventId,
      ...validItem,
    })

    await expect(
      stranger.query(api.items.listForOwner, { eventId })
    ).rejects.toThrow("Event not found")
    await expect(
      stranger.mutation(api.items.create, { eventId, ...validItem })
    ).rejects.toThrow("Event not found")
    await expect(
      stranger.mutation(api.items.update, { itemId, ...validItem })
    ).rejects.toThrow("Event not found")
    await expect(
      stranger.mutation(api.items.setHidden, { itemId, isHidden: true })
    ).rejects.toThrow("Event not found")
    await expect(
      stranger.mutation(api.items.move, { itemId, direction: "down" })
    ).rejects.toThrow("Event not found")
  })

  it.each([
    [{ ...validItem, name: "   " }, "item name"],
    [{ ...validItem, unitLabel: "" }, "unit label"],
    [{ ...validItem, priceMinor: -1 }, "item price"],
    [{ ...validItem, priceMinor: 1.25 }, "item price"],
    [{ ...validItem, inventoryTotal: -1 }, "inventory quantity"],
    [{ ...validItem, inventoryTotal: 1.25 }, "inventory quantity"],
  ])("rejects invalid item input", async (item, message) => {
    const t = createTest()
    const { client } = await createUser(
      t,
      `owner-${message}-${item.name}@example.com`
    )
    const eventId = await createEvent(client)

    await expect(
      client.mutation(api.items.create, { eventId, ...item })
    ).rejects.toThrow(message)
  })

  it("enforces the 100-item catalog limit", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)

    await Promise.all(
      Array.from({ length: 100 }, (_, index) => seedItem(t, eventId, index))
    )

    await expect(
      client.mutation(api.items.create, { eventId, ...validItem })
    ).rejects.toThrow("up to 100 catalog items")
  })

  it("appends deterministically and swaps only adjacent positions", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    const firstId = await client.mutation(api.items.create, {
      eventId,
      ...validItem,
      name: "First",
    })
    const secondId = await client.mutation(api.items.create, {
      eventId,
      ...validItem,
      name: "Second",
    })
    const thirdId = await client.mutation(api.items.create, {
      eventId,
      ...validItem,
      name: "Third",
    })

    await client.mutation(api.items.move, {
      itemId: thirdId,
      direction: "up",
    })
    let items = await client.query(api.items.listForOwner, { eventId })
    expect(items.map((item) => item._id)).toEqual([firstId, thirdId, secondId])
    expect(items.map((item) => item.sortOrder)).toEqual([0, 1, 2])

    await client.mutation(api.items.move, {
      itemId: firstId,
      direction: "up",
    })
    items = await client.query(api.items.listForOwner, { eventId })
    expect(items.map((item) => item._id)).toEqual([firstId, thirdId, secondId])
  })

  it("sets visibility idempotently", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    const itemId = await client.mutation(api.items.create, {
      eventId,
      ...validItem,
    })

    await client.mutation(api.items.setHidden, { itemId, isHidden: true })
    await client.mutation(api.items.setHidden, { itemId, isHidden: true })
    let items = await client.query(api.items.listForOwner, { eventId })
    expect(items[0]?.isHidden).toBe(true)

    await client.mutation(api.items.setHidden, { itemId, isHidden: false })
    await client.mutation(api.items.setHidden, { itemId, isHidden: false })
    items = await client.query(api.items.listForOwner, { eventId })
    expect(items[0]?.isHidden).toBe(false)
  })

  it("keeps archived catalogs readable and blocks every mutation", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    const itemId = await client.mutation(api.items.create, {
      eventId,
      ...validItem,
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { status: "archived" })
    })

    await expect(
      client.query(api.items.listForOwner, { eventId })
    ).resolves.toHaveLength(1)
    await expect(
      client.mutation(api.items.create, { eventId, ...validItem })
    ).rejects.toThrow("read-only")
    await expect(
      client.mutation(api.items.update, { itemId, ...validItem })
    ).rejects.toThrow("read-only")
    await expect(
      client.mutation(api.items.setHidden, { itemId, isHidden: true })
    ).rejects.toThrow("read-only")
    await expect(
      client.mutation(api.items.move, { itemId, direction: "down" })
    ).rejects.toThrow("read-only")
  })

  it("preserves reservations and rejects inventory below them", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    const itemId = await client.mutation(api.items.create, {
      eventId,
      ...validItem,
      inventoryTotal: 10,
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, { reservedQuantity: 4 })
    })

    await expect(
      client.mutation(api.items.update, {
        itemId,
        ...validItem,
        inventoryTotal: 3,
      })
    ).rejects.toThrow("4 units already reserved")

    await client.mutation(api.items.update, {
      itemId,
      ...validItem,
      inventoryTotal: 4,
    })
    const [item] = await client.query(api.items.listForOwner, { eventId })
    expect(item).toMatchObject({
      inventoryTotal: 4,
      reservedQuantity: 4,
      availableQuantity: 0,
    })
  })
})
