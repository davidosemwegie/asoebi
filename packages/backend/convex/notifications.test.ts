/// <reference types="vite/client" />

import betterAuthTest from "@convex-dev/better-auth/test"
import { type EmailEvent, type EmailId } from "@convex-dev/resend"
import resendTest from "@convex-dev/resend/test"
import { convexTest } from "convex-test"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

type TestHarness = ReturnType<typeof createTest>
type TestClient = ReturnType<TestHarness["withIdentity"]>

const verifyTemplate = {
  kind: "verify_email" as const,
  recipientName: "Ada",
  actionUrl: "https://asoebi.example/verify?token=test-token",
}

beforeAll(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-is-at-least-32-characters")
  vi.stubEnv("SITE_URL", "http://localhost:3000")
  vi.stubEnv("RESEND_API_KEY", "re_test_only")
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_test_only")
  vi.stubEnv("EMAIL_FROM", "Asoebi <onboarding@resend.dev>")
  vi.stubEnv("EMAIL_DELIVERY_MODE", "test")
})

function createTest() {
  const t = convexTest(schema, modules)
  betterAuthTest.register(t)
  resendTest.register(t)
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
        name: "Notification owner",
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
    client: t.withIdentity({ subject: user._id, sessionId: session._id }),
    userId: user._id,
  }
}

async function enqueue(
  t: TestHarness,
  overrides: Partial<{
    dedupeKey: string
    recipient: string
    ownerId: string
  }> = {}
) {
  return await t.mutation(internal.notifications.enqueueInternal, {
    dedupeKey: overrides.dedupeKey ?? "verify:ada:1",
    recipient: overrides.recipient ?? "ada@example.com",
    ownerId: overrides.ownerId,
    template: verifyTemplate,
  })
}

async function readNotification(t: TestHarness, id: Id<"notifications">) {
  return await t.run(async (ctx) => await ctx.db.get(id))
}

async function readDeliveries(
  t: TestHarness,
  notificationId: Id<"notifications">
) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("notificationDeliveries")
      .withIndex("by_notificationId_and_attemptNumber", (q) =>
        q.eq("notificationId", notificationId)
      )
      .order("asc")
      .collect()
  )
}

async function enqueueRendered(
  t: TestHarness,
  notificationId: Id<"notifications">,
  attemptNumber = 1
) {
  return await t.mutation(internal.notifications.enqueueRendered, {
    notificationId,
    attemptNumber,
    to: "delivered+asoebi-test@resend.dev",
    html: "<html><body><h1>Verify your email</h1></body></html>",
    text: "Verify your email: https://asoebi.example/verify?token=test-token",
  })
}

function commonEventData(providerId: string, createdAt: string) {
  return {
    created_at: createdAt,
    email_id: providerId,
    from: "Asoebi <onboarding@resend.dev>",
    to: ["delivered+asoebi-test@resend.dev"],
    subject: "Verify your Asoebi email",
  }
}

function sentEvent(providerId: string, createdAt: string): EmailEvent {
  return {
    type: "email.sent",
    created_at: createdAt,
    data: commonEventData(providerId, createdAt),
  }
}

function deliveredEvent(providerId: string, createdAt: string): EmailEvent {
  return {
    type: "email.delivered",
    created_at: createdAt,
    data: commonEventData(providerId, createdAt),
  }
}

function failedEvent(providerId: string, createdAt: string): EmailEvent {
  return {
    type: "email.failed",
    created_at: createdAt,
    data: {
      ...commonEventData(providerId, createdAt),
      failed: { reason: "Temporary provider failure" },
    },
  }
}

function bouncedEvent(
  providerId: string,
  createdAt: string,
  type: "Permanent" | "Transient",
  subType = "General"
): EmailEvent {
  return {
    type: "email.bounced",
    created_at: createdAt,
    data: {
      ...commonEventData(providerId, createdAt),
      bounce: {
        message:
          type === "Permanent" ? "Recipient does not exist" : "Mailbox full",
        subType,
        type,
      },
    },
  }
}

function complainedEvent(providerId: string, createdAt: string): EmailEvent {
  return {
    type: "email.complained",
    created_at: createdAt,
    data: commonEventData(providerId, createdAt),
  }
}

describe("notification outbox", () => {
  it("deduplicates one logical notification and normalizes its recipient", async () => {
    const t = createTest()
    const first = await enqueue(t, {
      recipient: "  Ada@Example.COM ",
      dedupeKey: " verify:ada:dedupe ",
    })
    const second = await enqueue(t, {
      recipient: "different@example.com",
      dedupeKey: "verify:ada:dedupe",
    })

    expect(second).toBe(first)
    const notifications = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect()
    )
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      dedupeKey: "verify:ada:dedupe",
      recipient: "ada@example.com",
      latestAttemptNumber: 1,
      activeAttemptNumber: 1,
    })
    expect(await readDeliveries(t, first)).toHaveLength(1)
  })

  it("rolls back the notification, delivery, and schedule with its source mutation", async () => {
    const t = createTest()

    await expect(
      t.mutation(async (ctx) => {
        await ctx.runMutation(internal.notifications.enqueueInternal, {
          dedupeKey: "rollback:test",
          recipient: "rollback@example.com",
          template: verifyTemplate,
        })
        throw new Error("roll back source work")
      })
    ).rejects.toThrow("roll back source work")

    const state = await t.run(async (ctx) => ({
      notifications: await ctx.db.query("notifications").collect(),
      deliveries: await ctx.db.query("notificationDeliveries").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }))
    expect(state.notifications).toEqual([])
    expect(state.deliveries).toEqual([])
    expect(state.scheduled).toEqual([])
  })

  it("records the component email ID atomically and is idempotent on action retry", async () => {
    const t = createTest()
    const notificationId = await enqueue(t)

    const firstId = await enqueueRendered(t, notificationId)
    const secondId = await enqueueRendered(t, notificationId)

    expect(secondId).toBe(firstId)
    const [delivery] = await readDeliveries(t, notificationId)
    expect(delivery).toMatchObject({
      attemptNumber: 1,
      componentEmailId: firstId,
      status: "queued",
    })
    const componentEmail = await t.query(components.resend.lib.get, {
      emailId: firstId as EmailId,
    })
    expect(componentEmail).toMatchObject({
      to: ["delivered+asoebi-test@resend.dev"],
      subject: "Verify your Asoebi email",
      status: "waiting",
    })
    expect(componentEmail?.text).toContain("https://asoebi.example/verify")
  })

  it("preserves numbered attempt history across manual retries", async () => {
    const t = createTest()
    const { client, userId } = await createUser(t, "owner@example.com")
    const notificationId = await enqueue(t, { ownerId: userId })
    await t.mutation(internal.notifications.markAttemptFailed, {
      notificationId,
      attemptNumber: 1,
      error: "Render failed",
    })

    await expect(
      client.mutation(api.notifications.retryMine, { notificationId })
    ).resolves.toBe(2)
    await t.mutation(internal.notifications.markAttemptFailed, {
      notificationId,
      attemptNumber: 2,
      error: "Provider unavailable",
    })
    await expect(
      client.mutation(api.notifications.retryMine, { notificationId })
    ).resolves.toBe(3)

    const view = await client.query(api.notifications.getMine, {
      notificationId,
    })
    expect(
      view?.deliveries.map(({ attemptNumber, status }) => ({
        attemptNumber,
        status,
      }))
    ).toEqual([
      { attemptNumber: 1, status: "failed" },
      { attemptNumber: 2, status: "failed" },
      { attemptNumber: 3, status: "scheduled" },
    ])
  })

  it("isolates status and retry operations to the notification owner", async () => {
    const t = createTest()
    const owner = await createUser(t, "owner@example.com")
    const other = await createUser(t, "other@example.com")
    const notificationId = await enqueue(t, { ownerId: owner.userId })
    await t.mutation(internal.notifications.markAttemptFailed, {
      notificationId,
      attemptNumber: 1,
      error: "Failed",
    })

    await expect(
      owner.client.query(api.notifications.getMine, { notificationId })
    ).resolves.toMatchObject({ notificationId, status: "failed" })
    await expect(
      other.client.query(api.notifications.getMine, { notificationId })
    ).resolves.toBeNull()
    await expect(
      t.query(api.notifications.getMine, { notificationId })
    ).resolves.toBeNull()
    await expect(
      other.client.mutation(api.notifications.retryMine, { notificationId })
    ).rejects.toThrow("Notification not found")
  })

  it("keeps the committed notification when the provider later fails", async () => {
    const t = createTest()
    const notificationId = await enqueue(t)
    const componentEmailId = await enqueueRendered(t, notificationId)

    await t.mutation(internal.notifications.handleEmailEvent, {
      id: componentEmailId as EmailId,
      event: failedEvent("provider-failed", "2026-08-27T12:00:00.000Z"),
    })

    expect(await readNotification(t, notificationId)).toMatchObject({
      status: "failed",
      latestProviderId: "provider-failed",
    })
    expect(await readDeliveries(t, notificationId)).toHaveLength(1)
  })

  it("reconciles a terminal component failure without a provider webhook", async () => {
    const t = createTest()
    const { client, userId } = await createUser(t, "reconcile@example.com")
    const notificationId = await enqueue(t, { ownerId: userId })
    const componentEmailId = await enqueueRendered(t, notificationId)

    await t.mutation(internal.notifications.reconcileComponentStatus, {
      notificationId,
      attemptNumber: 1,
      componentEmailId,
      status: "failed",
      reason: "Provider API retries were exhausted",
      permanent: false,
    })

    expect(await readNotification(t, notificationId)).toMatchObject({
      status: "failed",
    })
    expect(await readDeliveries(t, notificationId)).toEqual([
      expect.objectContaining({
        status: "failed",
        error: "Provider API retries were exhausted",
      }),
    ])
    await expect(
      client.mutation(api.notifications.retryMine, { notificationId })
    ).resolves.toBe(2)
  })
})

describe("provider event reconciliation", () => {
  it("ignores duplicate and older lower-precedence events", async () => {
    const t = createTest()
    const notificationId = await enqueue(t)
    const componentEmailId = await enqueueRendered(t, notificationId)
    const delivered = deliveredEvent(
      "provider-ordered",
      "2026-08-27T12:02:00.000Z"
    )

    await t.mutation(internal.notifications.handleEmailEvent, {
      id: componentEmailId as EmailId,
      event: delivered,
    })
    await t.mutation(internal.notifications.handleEmailEvent, {
      id: componentEmailId as EmailId,
      event: delivered,
    })
    await t.mutation(internal.notifications.handleEmailEvent, {
      id: componentEmailId as EmailId,
      event: sentEvent("provider-ordered", "2026-08-27T12:01:00.000Z"),
    })

    const notification = await readNotification(t, notificationId)
    const [delivery] = await readDeliveries(t, notificationId)
    expect(notification).toMatchObject({
      status: "delivered",
      latestProviderEventType: "email.delivered",
      latestProviderEventAt: Date.parse("2026-08-27T12:02:00.000Z"),
    })
    expect(delivery).toMatchObject({
      status: "delivered",
      providerEventType: "email.delivered",
      providerEventAt: Date.parse("2026-08-27T12:02:00.000Z"),
    })
  })

  it("keeps transient bounces retryable but permanently suppresses hard bounces", async () => {
    const t = createTest()
    const transientOwner = await createUser(t, "transient@example.com")
    const transientId = await enqueue(t, {
      dedupeKey: "transient:1",
      recipient: "transient@example.com",
      ownerId: transientOwner.userId,
    })
    const transientComponentId = await enqueueRendered(t, transientId)
    await t.mutation(internal.notifications.handleEmailEvent, {
      id: transientComponentId as EmailId,
      event: bouncedEvent(
        "provider-transient",
        "2026-08-27T12:00:00.000Z",
        "Transient"
      ),
    })
    await expect(
      transientOwner.client.mutation(api.notifications.retryMine, {
        notificationId: transientId,
      })
    ).resolves.toBe(2)

    const hardOwner = await createUser(t, "hard@example.com")
    const hardId = await enqueue(t, {
      dedupeKey: "hard:1",
      recipient: "hard@example.com",
      ownerId: hardOwner.userId,
    })
    const hardComponentId = await enqueueRendered(t, hardId)
    await t.mutation(internal.notifications.handleEmailEvent, {
      id: hardComponentId as EmailId,
      event: bouncedEvent(
        "provider-hard",
        "2026-08-27T12:00:00.000Z",
        "Permanent"
      ),
    })
    await expect(
      hardOwner.client.mutation(api.notifications.retryMine, {
        notificationId: hardId,
      })
    ).rejects.toThrow("not eligible for retry")

    const suppressedId = await enqueue(t, {
      dedupeKey: "hard:2",
      recipient: "HARD@example.com",
      ownerId: hardOwner.userId,
    })
    const suppressed = await readNotification(t, suppressedId)
    expect(suppressed).toMatchObject({ status: "suppressed" })
    expect(suppressed).not.toHaveProperty("activeAttemptNumber")
    expect(await readDeliveries(t, suppressedId)).toEqual([
      expect.objectContaining({ attemptNumber: 1, status: "suppressed" }),
    ])
  })

  it("makes complaints and explicit provider suppression terminal", async () => {
    const t = createTest()
    const complaintId = await enqueue(t, {
      dedupeKey: "complaint:1",
      recipient: "complaint@example.com",
    })
    const complaintComponentId = await enqueueRendered(t, complaintId)
    await t.mutation(internal.notifications.handleEmailEvent, {
      id: complaintComponentId as EmailId,
      event: complainedEvent("provider-complaint", "2026-08-27T12:00:00.000Z"),
    })
    expect(await readNotification(t, complaintId)).toMatchObject({
      status: "complained",
    })

    const explicitId = await enqueue(t, {
      dedupeKey: "suppression:1",
      recipient: "suppression@example.com",
    })
    const explicitComponentId = await enqueueRendered(t, explicitId)
    await t.mutation(internal.notifications.handleEmailEvent, {
      id: explicitComponentId as EmailId,
      event: sentEvent("provider-suppressed", "2026-08-27T12:00:00.000Z"),
    })
    await t.mutation(internal.notifications.handleSuppressedEvent, {
      providerId: "provider-suppressed",
      createdAt: "2026-08-27T12:01:00.000Z",
      reason: "Recipient is on the suppression list",
    })
    expect(await readNotification(t, explicitId)).toMatchObject({
      status: "suppressed",
      suppressionReason: "Recipient is on the suppression list",
    })
  })

  it("retains suppression received before the provider ID is known", async () => {
    const t = createTest()
    const notificationId = await enqueue(t, {
      dedupeKey: "suppression:early",
      recipient: "early-suppression@example.com",
    })
    const componentEmailId = await enqueueRendered(t, notificationId)

    await t.mutation(internal.notifications.handleSuppressedEvent, {
      providerId: "provider-early-suppression",
      createdAt: "2026-08-27T12:01:00.000Z",
      reason: "Address is on the provider suppression list",
    })
    expect(
      await t.run(async (ctx) =>
        ctx.db.query("pendingEmailSuppressions").collect()
      )
    ).toHaveLength(1)

    await t.mutation(internal.notifications.reconcileComponentStatus, {
      notificationId,
      attemptNumber: 1,
      componentEmailId,
      providerId: "provider-early-suppression",
      status: "sent",
      permanent: false,
    })

    expect(await readNotification(t, notificationId)).toMatchObject({
      status: "suppressed",
      suppressionReason: "Address is on the provider suppression list",
    })
    expect(
      await t.run(async (ctx) =>
        ctx.db.query("pendingEmailSuppressions").collect()
      )
    ).toEqual([])
  })

  it("does not let an older permanent event overwrite newer audit state", async () => {
    const t = createTest()
    const notificationId = await enqueue(t, {
      dedupeKey: "permanent:ordered",
      recipient: "permanent-order@example.com",
    })
    const componentEmailId = await enqueueRendered(t, notificationId)
    await t.mutation(internal.notifications.handleEmailEvent, {
      id: componentEmailId as EmailId,
      event: complainedEvent(
        "provider-permanent-order",
        "2026-08-27T12:02:00.000Z"
      ),
    })
    await t.mutation(internal.notifications.handleEmailEvent, {
      id: componentEmailId as EmailId,
      event: bouncedEvent(
        "provider-permanent-order",
        "2026-08-27T12:01:00.000Z",
        "Permanent"
      ),
    })

    expect(await readNotification(t, notificationId)).toMatchObject({
      status: "complained",
      latestProviderEventType: "email.complained",
      latestProviderEventAt: Date.parse("2026-08-27T12:02:00.000Z"),
    })
  })

  it("maps provider events without changing state for engagement-only events", async () => {
    const { providerUpdate } = await import("./notifications")
    expect(
      providerUpdate(
        bouncedEvent(
          "provider-map",
          "2026-08-27T12:00:00.000Z",
          "Permanent",
          "Suppressed"
        )
      )
    ).toMatchObject({ status: "suppressed", permanent: true })
    expect(
      providerUpdate(
        bouncedEvent("provider-map", "2026-08-27T12:00:00.000Z", "Transient")
      )
    ).toMatchObject({ status: "failed", permanent: false })
    const clicked: EmailEvent = {
      type: "email.clicked",
      created_at: "2026-08-27T12:00:00.000Z",
      data: {
        ...commonEventData("provider-map", "2026-08-27T12:00:00.000Z"),
        click: {
          ipAddress: "192.0.2.1",
          link: "https://asoebi.example/verify",
          timestamp: "2026-08-27T12:00:00.000Z",
          userAgent: "test",
        },
      },
    }
    expect(providerUpdate(clicked)).toBeNull()
  })
})

describe("Resend cleanup scheduling", () => {
  it("schedules the official finalized and abandoned cleanup functions with bounded retention", async () => {
    const t = createTest()
    await t.mutation(internal.emailCleanup.cleanFinalizedBodies, {})
    await t.mutation(internal.emailCleanup.cleanAbandonedRecords, {})

    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect()
    )
    expect(scheduled).toHaveLength(2)
    expect(scheduled.map(({ args }) => args[0])).toEqual(
      expect.arrayContaining([
        { olderThan: 7 * 24 * 60 * 60 * 1_000 },
        { olderThan: 28 * 24 * 60 * 60 * 1_000 },
      ])
    )
    expect(scheduled.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("cleanupOldEmails"),
        expect.stringContaining("cleanupAbandonedEmails"),
      ])
    )
  })

  it("advances through more than one bounded payload-scrubbing batch", async () => {
    const t = createTest()
    const expiredAt = Date.now() - 1_000
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("notifications", {
          dedupeKey: `expired:${index}`,
          recipient: `expired-${index}@example.com`,
          subject: "Verify your Asoebi email",
          templateKind: "verify_email",
          template: verifyTemplate,
          status: "failed",
          latestAttemptNumber: 1,
          payloadExpiresAt: expiredAt,
          createdAt: expiredAt,
          updatedAt: expiredAt,
        })
      }
    })

    await t.mutation(internal.emailCleanup.scrubExpiredApplicationPayloads, {})
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("notifications")
          .filter((q) => q.neq(q.field("template"), undefined))
          .collect()
      )
    ).toHaveLength(1)
    await t.mutation(internal.emailCleanup.scrubExpiredApplicationPayloads, {})
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("notifications")
          .filter((q) => q.neq(q.field("template"), undefined))
          .collect()
      )
    ).toHaveLength(0)
  })
})
