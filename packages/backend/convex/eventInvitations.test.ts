/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test"
import betterAuthTest from "@convex-dev/better-auth/test"
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
  vi.stubEnv("EMAIL_DELIVERY_MODE", "test")
})

function createTest() {
  const t = convexTest(schema, modules)
  betterAuthTest.register(t)
  aggregateTest.register(t, "invitationDeliveryCounts")
  aggregateTest.register(t, "invitationActivityCounts")
  return t
}

type Test = ReturnType<typeof createTest>
type Client = ReturnType<Test["withIdentity"]>

async function createUser(t: Test, email: string, verified = true) {
  const now = Date.now()
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: "Ada Owner",
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
        userId: user._id,
        token: `token-${email}`,
        expiresAt: now + DAY,
        createdAt: now,
        updatedAt: now,
      },
    },
  })
  return {
    client: t.withIdentity({
      subject: user._id,
      sessionId: session._id,
    }) as Client,
    userId: user._id,
  }
}

async function createEvent(client: Client) {
  return await client.mutation(api.events.create, {
    name: "Ada and Tunde",
    description: "A family wedding.",
    eventDate: "2027-12-12",
    orderDeadline: "2027-11-30",
    orderDeadlineAt: Date.now() + 30 * DAY,
    timeZone: "Africa/Lagos",
    location: "Lagos",
    contact: "owner@example.com",
    currency: "NGN",
  })
}

async function publishForSending(t: Test, eventId: Id<"events">) {
  await t.run(async (ctx) => {
    await ctx.db.patch(eventId, { status: "published" })
  })
}

describe("event invitations", () => {
  it("denies anonymous and cross-owner access", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: other } = await createUser(t, "other@example.com")
    const eventId = await createEvent(owner)
    await expect(
      t.mutation(api.eventInvitations.add, {
        eventId,
        name: "Guest",
        email: "guest@example.com",
      })
    ).rejects.toThrow("Unauthenticated")
    await expect(
      other.mutation(api.eventInvitations.add, {
        eventId,
        name: "Guest",
        email: "guest@example.com",
      })
    ).rejects.toThrow("Event not found")
  })

  it("normalizes emails, prevents concurrent duplicates, and never sends on creation", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        client.mutation(api.eventInvitations.add, {
          eventId,
          name: "Guest",
          email: " Guest@Example.COM ",
        })
      )
    )
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    const invitations = await t.run(async (ctx) =>
      ctx.db
        .query("eventInvitations")
        .withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", eventId))
        .collect()
    )
    expect(invitations).toHaveLength(1)
    expect(invitations[0]).toMatchObject({
      email: "guest@example.com",
      normalizedEmail: "guest@example.com",
      latestDeliveryState: "not_sent",
    })
    expect(
      await t.run(async (ctx) => ctx.db.query("notifications").take(10))
    ).toHaveLength(0)
  })

  it("allows an owner to list an archived event but keeps invitation writes read-only", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { status: "archived" })
    })
    await expect(
      client.query(api.eventInvitations.list, {
        eventId,
        paginationOpts: { cursor: null, numItems: 25 },
      })
    ).resolves.toMatchObject({ page: [] })
    await expect(
      client.mutation(api.eventInvitations.add, {
        eventId,
        name: "Guest",
        email: "guest@example.com",
      })
    ).rejects.toThrow("read-only")
  })

  it("commits valid import rows, reports duplicates and invalid rows, and replays exactly", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    const input = {
      eventId,
      importId: "import-0001",
      chunkIndex: 0,
      source: "csv" as const,
      rows: [
        { rowNumber: 2, name: "Ada", email: "ada@example.com" },
        { rowNumber: 3, name: "Ada again", email: "ADA@example.com" },
        { rowNumber: 4, name: "", email: "not-an-email" },
      ],
    }
    const first = await client.mutation(api.eventInvitations.importBatch, input)
    const replay = await client.mutation(
      api.eventInvitations.importBatch,
      input
    )
    expect(first).toEqual(replay)
    expect(first.summary).toEqual({ created: 1, duplicate: 1, invalid: 1 })
    await expect(
      client.mutation(api.eventInvitations.importBatch, {
        ...input,
        rows: [{ rowNumber: 2, name: "Changed", email: "changed@example.com" }],
      })
    ).rejects.toThrow("conflicts")
    expect(
      await t.run(async (ctx) => ctx.db.query("notifications").take(10))
    ).toHaveLength(0)
  })

  it("enforces 100-row chunks and a ten-chunk import boundary", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    const rows = Array.from({ length: 101 }, (_, index) => ({
      rowNumber: index + 2,
      name: `Guest ${index}`,
      email: `guest-${index}@example.com`,
    }))
    await expect(
      client.mutation(api.eventInvitations.importBatch, {
        eventId,
        importId: "import-0002",
        chunkIndex: 0,
        source: "paste",
        rows,
      })
    ).rejects.toThrow("1 and 100")
    await expect(
      client.mutation(api.eventInvitations.importBatch, {
        eventId,
        importId: "import-0002",
        chunkIndex: 10,
        source: "paste",
        rows: rows.slice(0, 1),
      })
    ).rejects.toThrow("chunk is invalid")
  })

  it("requires an explicit selected send, creates a new generation for resend, and blocks correction-free suppression", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await publishForSending(t, eventId)
    const invitation = await client.mutation(api.eventInvitations.add, {
      eventId,
      name: "Guest",
      email: "guest@example.com",
    })
    await expect(
      client.mutation(api.eventInvitations.send, {
        eventId,
        invitationIds: [],
        requestId: "send-0001",
      })
    ).rejects.toThrow("Select")
    const first = await client.mutation(api.eventInvitations.send, {
      eventId,
      invitationIds: [invitation._id],
      requestId: "send-0002",
    })
    const replay = await client.mutation(api.eventInvitations.send, {
      eventId,
      invitationIds: [invitation._id],
      requestId: "send-0002",
    })
    expect(first).toEqual(replay)
    const afterFirst = await t.run(async (ctx) => ctx.db.get(invitation._id))
    const resend = await client.mutation(api.eventInvitations.send, {
      eventId,
      invitationIds: [invitation._id],
      requestId: "send-0003",
      resend: true,
    })
    const afterResend = await t.run(async (ctx) => ctx.db.get(invitation._id))
    expect(resend[0].outcome).toBe("queued")
    expect(afterResend!.sendGeneration).toBe(afterFirst!.sendGeneration + 1)
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: afterResend!.currentNotificationId!,
      status: "bounced",
    })
    await expect(
      client.mutation(api.eventInvitations.retry, {
        eventId,
        invitationIds: [invitation._id],
        requestId: "retry-0001",
      })
    ).resolves.toEqual([{ invitationId: invitation._id, outcome: "blocked" }])
  })

  it("ignores an older logical notification when projecting a late provider update", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await publishForSending(t, eventId)
    const invitation = await client.mutation(api.eventInvitations.add, {
      eventId,
      name: "Guest",
      email: "guest@example.com",
    })
    await client.mutation(api.eventInvitations.send, {
      eventId,
      invitationIds: [invitation._id],
      requestId: "send-0010",
    })
    const first = await t.run(async (ctx) => ctx.db.get(invitation._id))
    await client.mutation(api.eventInvitations.send, {
      eventId,
      invitationIds: [invitation._id],
      requestId: "send-0011",
      resend: true,
    })
    const second = await t.run(async (ctx) => ctx.db.get(invitation._id))
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: first!.currentNotificationId!,
      status: "delivered",
    })
    expect(
      (await t.run(async (ctx) => ctx.db.get(invitation._id)))!
        .latestDeliveryState
    ).toBe("queued")
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: second!.currentNotificationId!,
      status: "delivered",
    })
    expect(
      (await t.run(async (ctx) => ctx.db.get(invitation._id)))!
        .latestDeliveryState
    ).toBe("delivered")
  })

  it("links only verified matching checkout users and does not gate another guest", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: verified, userId } = await createUser(
      t,
      "guest@example.com"
    )
    const { client: unverified } = await createUser(
      t,
      "other@example.com",
      false
    )
    const eventId = await createEvent(owner)
    await publishForSending(t, eventId)
    const event = await t.run(async (ctx) => ctx.db.get(eventId))
    const invitation = await owner.mutation(api.eventInvitations.add, {
      eventId,
      name: "Guest",
      email: "GUEST@example.com",
    })
    await verified.mutation(api.eventAttendees.startCheckout, {
      shareToken: event!.shareToken!,
    })
    const matched = await t.run(async (ctx) => ctx.db.get(invitation._id))
    expect(matched).toMatchObject({
      matchedUserId: userId,
      activity: "checkout_started",
    })
    await expect(
      unverified.mutation(api.eventAttendees.startCheckout, {
        shareToken: event!.shareToken!,
      })
    ).resolves.toBeNull()
  })
})
