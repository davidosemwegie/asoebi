/// <reference types="vite/client" />

import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { api, components } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import type { ActionCtx } from "./_generated/server"
import schema from "./schema"
import { deriveCoverVersion } from "./sharedEvents"

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

type TestHarness = ReturnType<typeof createTest>
type TestClient = ReturnType<TestHarness["withIdentity"]>

const eventInput = {
  name: "Ada and Tunde",
  description: "A family wedding celebration.",
  eventDate: "2027-12-12",
  orderDeadline: "2027-11-30",
  orderDeadlineAt: Date.now() + 30 * DAY,
  timeZone: "Africa/Lagos",
  location: "Lagos, Nigeria",
  contact: "family@example.com",
  currency: "NGN",
}

const itemInput = {
  name: "Emerald lace",
  description: "Intricate lace in the event colour.",
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
  email: string,
  { emailVerified = true, name = "Event user" } = {}
): Promise<{ client: TestClient; userId: string }> {
  const now = Date.now()
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: { name, email, emailVerified, createdAt: now, updatedAt: now },
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
    client: t.withIdentity({ subject: user._id, sessionId: session._id }),
    userId: user._id,
  }
}

async function createReadyEvent(
  client: TestClient,
  overrides: Partial<typeof eventInput> = {}
) {
  const eventId = await client.mutation(api.events.create, {
    ...eventInput,
    ...overrides,
  })
  const itemId = await client.mutation(api.items.create, {
    eventId,
    ...itemInput,
  })
  await client.mutation(api.eventSetup.savePaymentInstructions, {
    eventId,
    instructions: "PRIVATE BANK ACCOUNT 0123456789",
  })
  await client.mutation(api.eventSetup.createFulfillmentOption, {
    eventId,
    name: "Family pickup",
    type: "pickup",
    feeMinor: 0,
    instructions: "Private pickup instructions.",
    enabled: true,
    requiredFields: { kind: "pickup", pickupContact: true },
  })
  const event = await client.query(api.events.get, {
    eventId,
    now: Date.now(),
  })
  return { eventId, itemId, shareToken: event!.shareToken! }
}

async function publish(client: TestClient, eventId: Id<"events">) {
  await client.mutation(api.events.publish, { eventId })
}

describe("public event landing", () => {
  it("returns an exact tenant-safe public projection for anonymous visitors", async () => {
    const t = createTest()
    const { client: firstOwner, userId } = await createUser(
      t,
      "owner-one@example.com",
      { name: "PRIVATE ACCOUNT NAME" }
    )
    const { client: secondOwner } = await createUser(t, "owner-two@example.com")
    const first = await createReadyEvent(firstOwner)
    const hiddenId = await firstOwner.mutation(api.items.create, {
      eventId: first.eventId,
      ...itemInput,
      name: "PRIVATE HIDDEN ITEM",
    })
    await firstOwner.mutation(api.items.setHidden, {
      itemId: hiddenId,
      isHidden: true,
    })
    const second = await createReadyEvent(secondOwner, {
      name: "Second private event",
      contact: "second@example.com",
    })
    await publish(firstOwner, first.eventId)
    await publish(secondOwner, second.eventId)

    const landing = await t.query(api.sharedEvents.getLanding, {
      shareToken: first.shareToken,
      now: Date.now(),
    })

    expect(Object.keys(landing!).sort()).toEqual(
      [
        "currency",
        "description",
        "eventDate",
        "coverVersion",
        "items",
        "location",
        "name",
        "orderDeadlineAt",
        "orderingOpen",
        "organizerContact",
        "timeZone",
      ].sort()
    )
    expect(landing).toEqual({
      name: eventInput.name,
      description: eventInput.description,
      eventDate: eventInput.eventDate,
      location: eventInput.location,
      orderDeadlineAt: eventInput.orderDeadlineAt,
      timeZone: eventInput.timeZone,
      organizerContact: eventInput.contact,
      currency: eventInput.currency,
      coverVersion: null,
      orderingOpen: true,
      items: [
        {
          itemKey: first.itemId,
          name: itemInput.name,
          description: itemInput.description,
          unitLabel: itemInput.unitLabel,
          priceMinor: itemInput.priceMinor,
          availableQuantity: itemInput.inventoryTotal,
        },
      ],
    })
    const serialized = JSON.stringify(landing)
    expect(serialized).not.toContain(userId)
    expect(serialized).not.toContain("PRIVATE ACCOUNT NAME")
    expect(serialized).not.toContain("PRIVATE BANK ACCOUNT")
    expect(serialized).not.toContain("Private pickup instructions")
    expect(serialized).not.toContain("PRIVATE HIDDEN ITEM")
    expect(serialized).not.toContain(first.eventId)
    expect(serialized).not.toContain(second.eventId)
    expect(serialized).not.toContain("convex.cloud")

    await expect(
      t.query(api.sharedEvents.getLanding, {
        shareToken: second.shareToken,
        now: Date.now(),
      })
    ).resolves.toMatchObject({
      name: "Second private event",
      organizerContact: "second@example.com",
    })
  })

  it.each(["draft", "closed", "archived"] as const)(
    "does not reveal a %s event",
    async (status) => {
      const t = createTest()
      const { client } = await createUser(t, `${status}@example.com`)
      const event = await createReadyEvent(client)
      await t.run(async (ctx) => {
        await ctx.db.patch(event.eventId, { status })
      })
      await expect(
        t.query(api.sharedEvents.getLanding, {
          shareToken: event.shareToken,
          now: Date.now(),
        })
      ).resolves.toBeNull()
    }
  )

  it("does not reveal invalid or missing tokens", async () => {
    const t = createTest()
    await expect(
      t.query(api.sharedEvents.getLanding, {
        shareToken: "not-a-valid-token",
        now: Date.now(),
      })
    ).resolves.toBeNull()
    await expect(
      t.query(api.sharedEvents.getLanding, {
        shareToken: "a".repeat(32),
        now: Date.now(),
      })
    ).resolves.toBeNull()
  })

  it("reports sold-out availability without exposing inventory internals", async () => {
    const t = createTest()
    const { client } = await createUser(t, "sold-out@example.com")
    const event = await createReadyEvent(client)
    await t.run(async (ctx) => {
      const item = await ctx.db
        .query("items")
        .withIndex("by_eventId_and_sortOrder", (q) =>
          q.eq("eventId", event.eventId)
        )
        .first()
      await ctx.db.patch(item!._id, { reservedQuantity: item!.inventoryTotal })
      await ctx.db.patch(event.eventId, { status: "published" })
    })
    const landing = await t.query(api.sharedEvents.getLanding, {
      shareToken: event.shareToken,
      now: Date.now(),
    })
    expect(landing?.items[0]?.availableQuantity).toBe(0)
    expect(landing?.items[0]).not.toHaveProperty("inventoryTotal")
    expect(landing?.items[0]).not.toHaveProperty("reservedQuantity")
  })

  it("closes ordering at the exact caller-supplied deadline", async () => {
    const t = createTest()
    const { client } = await createUser(t, "deadline@example.com")
    const event = await createReadyEvent(client)
    await publish(client, event.eventId)

    await expect(
      t.query(api.sharedEvents.getLanding, {
        shareToken: event.shareToken,
        now: eventInput.orderDeadlineAt - 1,
      })
    ).resolves.toMatchObject({ orderingOpen: true })
    await expect(
      t.query(api.sharedEvents.getLanding, {
        shareToken: event.shareToken,
        now: eventInput.orderDeadlineAt,
      })
    ).resolves.toMatchObject({ orderingOpen: false })
  })

  it("uses an opaque cover version that changes with replacement state", () => {
    const first = deriveCoverVersion(1_000, "first-sha256")
    const replaced = deriveCoverVersion(2_000, "second-sha256")
    expect(first).toMatch(/^[a-z0-9]{14}$/)
    expect(replaced).toMatch(/^[a-z0-9]{14}$/)
    expect(replaced).not.toBe(first)
  })
})

describe("public cover relay", () => {
  const shareToken = "a".repeat(32)
  const coverVersion = "abc1234def5678"
  const storageId = "storage-id" as Id<"_storage">

  it("relays validated image bytes without caching the Convex response", async () => {
    const { servePublicEventCover } = await import("./http")
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
    const runQuery = vi.fn().mockResolvedValue({
      storageId,
      contentType: "image/png",
    })
    const get = vi
      .fn()
      .mockResolvedValue(new Blob([bytes], { type: "image/png" }))
    const response = await servePublicEventCover(
      { runQuery, storage: { get } } as unknown as ActionCtx,
      new Request(
        `http://localhost/public-event-cover/v1/${coverVersion}/${shareToken}`
      )
    )

    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      shareToken,
      coverVersion,
    })
    expect(get).toHaveBeenCalledWith(storageId)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it("returns not found for malformed or unavailable cover requests", async () => {
    const { servePublicEventCover } = await import("./http")
    const runQuery = vi.fn().mockResolvedValue(null)
    const ctx = {
      runQuery,
      storage: { get: vi.fn() },
    } as unknown as ActionCtx

    await expect(
      servePublicEventCover(
        ctx,
        new Request(`http://localhost/public-event-cover/v1/bad!/${shareToken}`)
      )
    ).resolves.toMatchObject({ status: 404 })
    expect(runQuery).not.toHaveBeenCalled()

    await expect(
      servePublicEventCover(
        ctx,
        new Request(
          `http://localhost/public-event-cover/v1/${coverVersion}/${shareToken}`
        )
      )
    ).resolves.toMatchObject({ status: 404 })
  })
})

describe("event attendee checkout start", () => {
  it("requires authentication but not email verification", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: unverified } = await createUser(t, "guest@example.com", {
      emailVerified: false,
    })
    const event = await createReadyEvent(owner)
    await publish(owner, event.eventId)

    await expect(
      t.mutation(api.eventAttendees.startCheckout, {
        shareToken: event.shareToken,
      })
    ).rejects.toThrow("Unauthenticated")
    await expect(
      unverified.mutation(api.eventAttendees.startCheckout, {
        shareToken: event.shareToken,
      })
    ).resolves.toBeNull()
  })

  it("is idempotent and permits the owner to join their own event", async () => {
    const t = createTest()
    const { client: owner, userId } = await createUser(
      t,
      "owner-attendee@example.com"
    )
    const event = await createReadyEvent(owner)
    await publish(owner, event.eventId)

    await Promise.all(
      Array.from({ length: 4 }, () =>
        owner.mutation(api.eventAttendees.startCheckout, {
          shareToken: event.shareToken,
        })
      )
    )
    const first = await t.run(async (ctx) =>
      ctx.db
        .query("eventAttendees")
        .withIndex("by_eventId_and_userId", (q) =>
          q.eq("eventId", event.eventId).eq("userId", userId)
        )
        .unique()
    )
    await owner.mutation(api.eventAttendees.startCheckout, {
      shareToken: event.shareToken,
    })
    const attendees = await t.run(async (ctx) =>
      ctx.db
        .query("eventAttendees")
        .withIndex("by_eventId_and_userId", (q) =>
          q.eq("eventId", event.eventId).eq("userId", userId)
        )
        .collect()
    )
    expect(attendees).toHaveLength(1)
    expect(attendees[0]).toEqual(first)
    expect(first).toMatchObject({
      eventId: event.eventId,
      userId,
      createdAt: first!.updatedAt,
    })
  })

  it("allows one user to participate in multiple events", async () => {
    const t = createTest()
    const { client, userId } = await createUser(t, "multi-event@example.com")
    const first = await createReadyEvent(client, { name: "First event" })
    const second = await createReadyEvent(client, { name: "Second event" })
    await publish(client, first.eventId)
    await publish(client, second.eventId)

    await client.mutation(api.eventAttendees.startCheckout, {
      shareToken: first.shareToken,
    })
    await client.mutation(api.eventAttendees.startCheckout, {
      shareToken: second.shareToken,
    })
    const attendees = await t.run(async (ctx) =>
      ctx.db
        .query("eventAttendees")
        .withIndex("by_userId_and_eventId", (q) => q.eq("userId", userId))
        .collect()
    )
    expect(new Set(attendees.map((row) => row.eventId))).toEqual(
      new Set([first.eventId, second.eventId])
    )
  })

  it.each(["draft", "closed", "archived"] as const)(
    "rejects checkout for a %s event",
    async (status) => {
      const t = createTest()
      const { client } = await createUser(t, `${status}-attendee@example.com`)
      const event = await createReadyEvent(client)
      await t.run(async (ctx) => {
        await ctx.db.patch(event.eventId, { status })
      })
      await expect(
        client.mutation(api.eventAttendees.startCheckout, {
          shareToken: event.shareToken,
        })
      ).rejects.toThrow("event link is not available")
    }
  )

  it("rejects checkout after the exact deadline", async () => {
    const t = createTest()
    const { client } = await createUser(t, "expired@example.com")
    const event = await createReadyEvent(client)
    await t.run(async (ctx) => {
      await ctx.db.patch(event.eventId, {
        status: "published",
        orderDeadlineAt: Date.now() - 1,
      })
    })
    await expect(
      client.mutation(api.eventAttendees.startCheckout, {
        shareToken: event.shareToken,
      })
    ).rejects.toThrow("deadline has passed")
  })
})
