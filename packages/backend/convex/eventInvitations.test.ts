/// <reference types="vite/client" />

import aggregateTest from "@convex-dev/aggregate/test"
import { TableAggregate } from "@convex-dev/aggregate"
import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "./_generated/api"
import type { DataModel, Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const DAY = 24 * 60 * 60 * 1_000

const invitationDeliveryCounts = new TableAggregate<{
  Namespace: Id<"events">
  Key: string
  DataModel: DataModel
  TableName: "eventInvitations"
}>(components.invitationDeliveryCounts, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => doc.latestDeliveryState,
})

const invitationActivityCounts = new TableAggregate<{
  Namespace: Id<"events">
  Key: string
  DataModel: DataModel
  TableName: "eventInvitations"
}>(components.invitationActivityCounts, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => doc.activity,
})

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

async function deliveryCount(t: Test, eventId: Id<"events">, state: string) {
  return await t.run(async (ctx) =>
    invitationDeliveryCounts.count(ctx, {
      namespace: eventId,
      bounds: {
        lower: { key: state, inclusive: true },
        upper: { key: state, inclusive: true },
      },
    })
  )
}

async function activityCount(t: Test, eventId: Id<"events">, state: string) {
  return await t.run(async (ctx) =>
    invitationActivityCounts.count(ctx, {
      namespace: eventId,
      bounds: {
        lower: { key: state, inclusive: true },
        upper: { key: state, inclusive: true },
      },
    })
  )
}

async function deliveryAttemptCount(
  t: Test,
  notificationId: Id<"notifications">
) {
  return await t.run(
    async (ctx) =>
      (
        await ctx.db
          .query("notificationDeliveries")
          .withIndex("by_notificationId_and_attemptNumber", (q) =>
            q.eq("notificationId", notificationId)
          )
          .take(10)
      ).length
  )
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

  it("removes bounded draft invitation data and its aggregate namespaces", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: other } = await createUser(t, "other@example.com")
    const eventId = await createEvent(owner)
    const manual = await owner.mutation(api.eventInvitations.add, {
      eventId,
      name: "Manual guest",
      email: "manual@example.com",
    })
    const imported = await owner.mutation(api.eventInvitations.importBatch, {
      eventId,
      importId: "draft-delete-import",
      chunkIndex: 0,
      source: "csv",
      rows: [
        { rowNumber: 2, name: "Imported guest", email: "import@example.com" },
      ],
    })
    const importedInvitationId = imported.outcomes[0]!.invitationId!
    const now = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.insert("eventInvitationSendRequests", {
        eventId,
        requestId: "draft-delete-send",
        kind: "send",
        resend: false,
        invitationIds: [manual._id, importedInvitationId],
        results: [
          { invitationId: manual._id, outcome: "already_sent" },
          { invitationId: importedInvitationId, outcome: "already_sent" },
        ],
        createdAt: now,
        expiresAt: now + DAY,
      })
      expect(await ctx.db.query("notificationDeliveries").take(1)).toEqual([])
    })
    expect(await deliveryCount(t, eventId, "not_sent")).toBe(2)
    expect(await activityCount(t, eventId, "not_started")).toBe(2)
    await expect(
      other.mutation(api.events.remove, { eventId })
    ).resolves.toBeNull()
    expect(await deliveryCount(t, eventId, "not_sent")).toBe(2)

    await owner.mutation(api.events.remove, { eventId })

    await t.run(async (ctx) => {
      expect(await ctx.db.get(eventId)).toBeNull()
      expect(
        await ctx.db
          .query("eventInvitations")
          .withIndex("by_eventId_and_createdAt", (q) =>
            q.eq("eventId", eventId)
          )
          .take(1)
      ).toEqual([])
      expect(
        await ctx.db
          .query("eventInvitationImportChunks")
          .withIndex("by_eventId_and_importId_and_chunkIndex", (q) =>
            q.eq("eventId", eventId)
          )
          .take(1)
      ).toEqual([])
      expect(
        await ctx.db
          .query("eventInvitationSendRequests")
          .withIndex("by_eventId_and_requestId", (q) =>
            q.eq("eventId", eventId)
          )
          .take(1)
      ).toEqual([])
      expect(
        await ctx.db
          .query("notifications")
          .withIndex("by_eventRef_and_updatedAt", (q) =>
            q.eq("eventRef", `${eventId}`)
          )
          .take(1)
      ).toEqual([])
      expect(await ctx.db.query("notificationDeliveries").take(1)).toEqual([])
    })
    expect(await deliveryCount(t, eventId, "not_sent")).toBe(0)
    expect(await activityCount(t, eventId, "not_started")).toBe(0)
  })

  it("keeps invitation data when a non-draft event is deleted", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    const invitation = await client.mutation(api.eventInvitations.add, {
      eventId,
      name: "Guest",
      email: "guest@example.com",
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { status: "published" })
    })

    await expect(
      client.mutation(api.events.remove, { eventId })
    ).rejects.toThrow("Only draft events")
    expect(
      await t.run(async (ctx) => ctx.db.get(invitation._id))
    ).not.toBeNull()
    expect(await deliveryCount(t, eventId, "not_sent")).toBe(1)
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

  it("accepts row one for a headerless pasted import", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await expect(
      client.mutation(api.eventInvitations.importBatch, {
        eventId,
        importId: "headerless-paste-0001",
        chunkIndex: 0,
        source: "paste",
        rows: [{ rowNumber: 1, name: "Ada", email: "ada@example.com" }],
      })
    ).resolves.toMatchObject({ summary: { created: 1 } })
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
    await expect(
      client.mutation(api.eventInvitations.importBatch, {
        eventId,
        importId: "import-duplicate-row-number",
        chunkIndex: 0,
        source: "csv",
        rows: [
          { rowNumber: 2, name: "Ada", email: "ada@example.com" },
          { rowNumber: 2, name: "Ola", email: "ola@example.com" },
        ],
      })
    ).rejects.toThrow("row numbers must be unique")
    await client.mutation(api.eventInvitations.importBatch, {
      eventId,
      importId: "import-overlapping-row-number",
      chunkIndex: 0,
      source: "csv",
      rows: [{ rowNumber: 2, name: "Ada", email: "ada@example.com" }],
    })
    await expect(
      client.mutation(api.eventInvitations.importBatch, {
        eventId,
        importId: "import-overlapping-row-number",
        chunkIndex: 1,
        source: "csv",
        rows: [{ rowNumber: 2, name: "Ola", email: "ola@example.com" }],
      })
    ).rejects.toThrow("overlap an earlier")
  })

  it("continues bounded receipt cleanup until expired imports are drained", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    const expiredAt = Date.now() - 1
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("eventInvitationImportChunks", {
          eventId,
          importId: `expired-import-${index}`,
          chunkIndex: 0,
          payloadHash: `${index}`,
          outcomes: [{ rowNumber: 2, outcome: "invalid", error: "Invalid" }],
          createdAt: expiredAt,
          expiresAt: expiredAt,
        })
      }
    })
    await t.mutation(internal.eventInvitations.cleanExpiredReceipts, {})
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("eventInvitationImportChunks")
          .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
          .take(101)
      )
    ).toHaveLength(1)
    expect(
      (
        await t.run(async (ctx) =>
          ctx.db.system.query("_scheduled_functions").take(10)
        )
      ).map(({ name }) => name)
    ).toEqual([
      expect.stringContaining("eventInvitations:cleanExpiredReceipts"),
    ])
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
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: afterFirst!.currentNotificationId!,
      status: "sent",
    })
    const resend = await client.mutation(api.eventInvitations.send, {
      eventId,
      invitationIds: [invitation._id],
      requestId: "send-0003",
      resend: true,
    })
    const afterResend = await t.run(async (ctx) => ctx.db.get(invitation._id))
    expect(resend[0].outcome).toBe("queued")
    expect(afterResend!.sendGeneration).toBe(afterFirst!.sendGeneration + 1)
    await expect(
      client.mutation(api.eventInvitations.send, {
        eventId,
        invitationIds: [invitation._id],
        requestId: "send-0002",
        resend: true,
      })
    ).rejects.toThrow("conflicts")
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

  it("retries failed and delayed invitations with one aggregate state replacement", async () => {
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
      requestId: "send-0020",
    })
    const current = await t.run(async (ctx) => ctx.db.get(invitation._id))
    await t.run(async (ctx) => {
      await ctx.db.patch(current!.currentNotificationId!, { status: "failed" })
    })
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: current!.currentNotificationId!,
      status: "failed",
    })
    expect(await deliveryCount(t, eventId, "failed")).toBe(1)
    await expect(
      client.mutation(api.eventInvitations.retry, {
        eventId,
        invitationIds: [invitation._id],
        requestId: "retry-0020",
      })
    ).resolves.toEqual([{ invitationId: invitation._id, outcome: "retried" }])
    expect(await deliveryCount(t, eventId, "failed")).toBe(0)
    expect(await deliveryCount(t, eventId, "queued")).toBe(1)

    await t.run(async (ctx) => {
      await ctx.db.patch(current!.currentNotificationId!, { status: "delayed" })
    })
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: current!.currentNotificationId!,
      status: "delayed",
    })
    expect(await deliveryCount(t, eventId, "delayed")).toBe(1)
    await client.mutation(api.eventInvitations.retry, {
      eventId,
      invitationIds: [invitation._id],
      requestId: "retry-0021",
    })
    expect(await deliveryCount(t, eventId, "delayed")).toBe(0)
    expect(await deliveryCount(t, eventId, "queued")).toBe(1)
  })

  it("does not retry a failed invitation after the event closes", async () => {
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
      requestId: "send-0025",
    })
    const current = await t.run(async (ctx) => ctx.db.get(invitation._id))
    await t.run(async (ctx) => {
      await ctx.db.patch(current!.currentNotificationId!, { status: "failed" })
      await ctx.db.patch(eventId, { status: "closed" })
    })
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: current!.currentNotificationId!,
      status: "failed",
    })
    await expect(
      client.mutation(api.eventInvitations.retry, {
        eventId,
        invitationIds: [invitation._id],
        requestId: "retry-0025",
      })
    ).rejects.toThrow("Publish the event")
  })

  it("rejects generic retry for a current invitation after the event closes", async () => {
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
      requestId: "send-0025-generic",
    })
    const current = await t.run(async (ctx) => ctx.db.get(invitation._id))
    const notificationId = current!.currentNotificationId!
    await t.run(async (ctx) => {
      await ctx.db.patch(notificationId, { status: "failed" })
      await ctx.db.patch(eventId, { status: "closed" })
    })
    const beforeAttempts = await deliveryAttemptCount(t, notificationId)

    await expect(
      client.mutation(api.notifications.retryMine, { notificationId })
    ).rejects.toThrow("guest list")

    expect(await deliveryAttemptCount(t, notificationId)).toBe(beforeAttempts)
  })

  it("does not send or retry invitations after the ordering deadline", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await publishForSending(t, eventId)
    const invitation = await client.mutation(api.eventInvitations.add, {
      eventId,
      name: "Guest",
      email: "guest@example.com",
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { orderDeadlineAt: Date.now() - 1 })
    })
    await expect(
      client.mutation(api.eventInvitations.send, {
        eventId,
        invitationIds: [invitation._id],
        requestId: "send-0026",
      })
    ).rejects.toThrow("ordering deadline")
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { orderDeadlineAt: Date.now() + DAY })
    })
    await client.mutation(api.eventInvitations.send, {
      eventId,
      invitationIds: [invitation._id],
      requestId: "send-0027",
    })
    const current = await t.run(async (ctx) => ctx.db.get(invitation._id))
    await t.run(async (ctx) => {
      await ctx.db.patch(current!.currentNotificationId!, { status: "failed" })
      await ctx.db.patch(eventId, { orderDeadlineAt: Date.now() - 1 })
    })
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: current!.currentNotificationId!,
      status: "failed",
    })
    await expect(
      client.mutation(api.eventInvitations.retry, {
        eventId,
        invitationIds: [invitation._id],
        requestId: "retry-0026",
      })
    ).rejects.toThrow("ordering deadline")
  })

  it("rejects generic retry for a current invitation after the ordering deadline", async () => {
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
      requestId: "send-0026-generic",
    })
    const current = await t.run(async (ctx) => ctx.db.get(invitation._id))
    const notificationId = current!.currentNotificationId!
    await t.run(async (ctx) => {
      await ctx.db.patch(notificationId, { status: "failed" })
      await ctx.db.patch(eventId, { orderDeadlineAt: Date.now() - 1 })
    })
    const beforeAttempts = await deliveryAttemptCount(t, notificationId)

    await expect(
      client.mutation(api.notifications.retryMine, { notificationId })
    ).rejects.toThrow("guest list")

    expect(await deliveryAttemptCount(t, notificationId)).toBe(beforeAttempts)
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
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: first!.currentNotificationId!,
      status: "sent",
    })
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

  it("projects a late permanent event from an older generation as suppression", async () => {
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
      requestId: "send-0030",
    })
    const first = await t.run(async (ctx) => ctx.db.get(invitation._id))
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: first!.currentNotificationId!,
      status: "sent",
    })
    await client.mutation(api.eventInvitations.send, {
      eventId,
      invitationIds: [invitation._id],
      requestId: "send-0031",
      resend: true,
    })
    const resend = await t.run(async (ctx) => ctx.db.get(invitation._id))
    await t.mutation(internal.eventInvitations.projectNotificationDelivery, {
      notificationId: first!.currentNotificationId!,
      status: "bounced",
    })
    expect(
      (await t.run(async (ctx) => ctx.db.get(invitation._id)))!
        .latestDeliveryState
    ).toBe("suppressed")
    expect(
      (await t.run(async (ctx) => ctx.db.get(invitation._id)))!
        .currentNotificationId
    ).toBe(resend!.currentNotificationId)
    await expect(
      client.mutation(api.eventInvitations.retry, {
        eventId,
        invitationIds: [invitation._id],
        requestId: "retry-0030",
      })
    ).resolves.toEqual([{ invitationId: invitation._id, outcome: "blocked" }])
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
    await t.run(async (ctx) => {
      const before = await ctx.db.get(invitation._id)
      await ctx.db.patch(invitation._id, { activity: "order_submitted" })
      const after = await ctx.db.get(invitation._id)
      await invitationActivityCounts.replace(ctx, before!, after!)
    })
    await verified.mutation(api.eventAttendees.startCheckout, {
      shareToken: event!.shareToken!,
    })
    expect(
      (await t.run(async (ctx) => ctx.db.get(invitation._id)))!.activity
    ).toBe("order_submitted")
    await expect(
      unverified.mutation(api.eventAttendees.startCheckout, {
        shareToken: event!.shareToken!,
      })
    ).resolves.toBeNull()
  })
})
