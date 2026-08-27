/// <reference types="vite/client" />

import betterAuthTest from "@convex-dev/better-auth/test"
import resendTest from "@convex-dev/resend/test"
import { convexTest } from "convex-test"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { api, components } from "./_generated/api"
import { createAuth } from "./auth"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const password = "correct-horse-battery-staple"

type TestHarness = ReturnType<typeof createTest>

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

async function authPost(
  t: TestHarness,
  path: string,
  body: Record<string, unknown>
) {
  return await t.fetch(`/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  })
}

async function signUp(
  t: TestHarness,
  email: string,
  name = "Ada Organizer"
) {
  return await authPost(t, "/sign-up/email", {
    email,
    name,
    password,
    callbackURL: "http://localhost:3000/verify-email",
  })
}

async function resetNotification(t: TestHarness) {
  const notifications = await t.run(async (ctx) =>
    ctx.db.query("notifications").order("desc").collect()
  )
  return notifications.find(
    (notification) => notification.template?.kind === "reset_password"
  )
}

async function countSessions(t: TestHarness, userId: string) {
  const result = await t.query(components.betterAuth.adapter.findMany, {
    model: "session",
    where: [{ field: "userId", operator: "eq", value: userId }],
    paginationOpts: { cursor: null, numItems: 20 },
  })
  return result.page.length
}

describe("Better Auth email configuration", () => {
  it("enables signup verification without blocking sign-in and configures reset security", async () => {
    const t = createTest()
    const configured = await t.action(async (ctx) => {
      const auth = createAuth(ctx)
      return {
        sendOnSignUp: auth.options.emailVerification?.sendOnSignUp,
        verificationExpiresIn: auth.options.emailVerification?.expiresIn,
        requireEmailVerification:
          auth.options.emailAndPassword?.requireEmailVerification,
        resetExpiresIn:
          auth.options.emailAndPassword?.resetPasswordTokenExpiresIn,
        revokeSessionsOnReset:
          auth.options.emailAndPassword?.revokeSessionsOnPasswordReset,
        hasVerificationSender:
          typeof auth.options.emailVerification?.sendVerificationEmail ===
          "function",
        hasResetSender:
          typeof auth.options.emailAndPassword?.sendResetPassword === "function",
      }
    })

    expect(configured).toEqual({
      sendOnSignUp: true,
      verificationExpiresIn: 3_600,
      requireEmailVerification: false,
      resetExpiresIn: 3_600,
      revokeSessionsOnReset: true,
      hasVerificationSender: true,
      hasResetSender: true,
    })
  })

  it("schedules verification on signup and permits sign-in before verification", async () => {
    const t = createTest()
    const signup = await signUp(t, "unverified@example.com")
    expect(signup.status).toBe(200)
    await t.finishInProgressScheduledFunctions()

    const notifications = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect()
    )
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      recipient: "unverified@example.com",
      status: "queued",
      template: {
        kind: "verify_email",
        recipientName: "Ada Organizer",
      },
    })
    const deliveries = await t.run(async (ctx) =>
      ctx.db.query("notificationDeliveries").collect()
    )
    expect(deliveries).toEqual([
      expect.objectContaining({
        notificationId: notifications[0]?._id,
        attemptNumber: 1,
        status: "queued",
        componentEmailId: expect.any(String),
      }),
    ])
    expect(notifications[0]?.template?.actionUrl).toContain(
      "/api/auth/verify-email?token="
    )

    const signin = await authPost(t, "/sign-in/email", {
      email: "unverified@example.com",
      password,
    })
    expect(signin.status).toBe(200)
    await expect(signin.json()).resolves.toMatchObject({
      user: { email: "unverified@example.com", emailVerified: false },
    })
  })

  it("returns the same visible reset result for known and unknown accounts", async () => {
    const t = createTest()
    expect((await signUp(t, "known@example.com")).status).toBe(200)

    const known = await authPost(t, "/request-password-reset", {
      email: "known@example.com",
      redirectTo: "http://localhost:3000/reset-password",
    })
    const unknown = await authPost(t, "/request-password-reset", {
      email: "unknown@example.com",
      redirectTo: "http://localhost:3000/reset-password",
    })

    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(await known.json()).toEqual(await unknown.json())
    expect(await resetNotification(t)).toMatchObject({
      recipient: "known@example.com",
      template: { kind: "reset_password", expiresInMinutes: 60 },
    })
  })

  it("resets the password, consumes the token, and revokes existing sessions", async () => {
    const t = createTest()
    expect((await signUp(t, "reset-flow@example.com")).status).toBe(200)
    expect(
      (
        await authPost(t, "/sign-in/email", {
          email: "reset-flow@example.com",
          password,
        })
      ).status
    ).toBe(200)
    const verificationNotification = await t.run(async (ctx) =>
      ctx.db.query("notifications").first()
    )
    const userId = verificationNotification?.ownerId
    expect(userId).toBeTruthy()
    expect(await countSessions(t, userId!)).toBeGreaterThanOrEqual(2)

    const request = await authPost(t, "/request-password-reset", {
      email: "reset-flow@example.com",
      redirectTo: "http://localhost:3000/reset-password",
    })
    expect(request.status).toBe(200)
    const notification = await resetNotification(t)
    expect(notification?.template?.kind).toBe("reset_password")
    const actionUrl = notification!.template!.actionUrl
    const token = actionUrl.match(/\/reset-password\/([^?]+)/)?.[1]
    expect(token).toBeTruthy()

    const newPassword = "new-correct-horse-battery-staple"
    const reset = await authPost(t, "/reset-password", {
      token,
      newPassword,
    })
    expect(reset.status).toBe(200)
    expect(await countSessions(t, userId!)).toBe(0)

    const reused = await authPost(t, "/reset-password", {
      token,
      newPassword: "another-valid-password",
    })
    expect(reused.status).not.toBe(200)
    expect(
      (
        await authPost(t, "/sign-in/email", {
          email: "reset-flow@example.com",
          password,
        })
      ).status
    ).not.toBe(200)
    expect(
      (
        await authPost(t, "/sign-in/email", {
          email: "reset-flow@example.com",
          password: newPassword,
        })
      ).status
    ).toBe(200)
  })

  it("rejects a reset token after the configured one-hour expiry", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-27T12:00:00.000Z"))
    try {
      const t = createTest()
      expect((await signUp(t, "expired@example.com")).status).toBe(200)
      expect(
        (
          await authPost(t, "/request-password-reset", {
            email: "expired@example.com",
            redirectTo: "http://localhost:3000/reset-password",
          })
        ).status
      ).toBe(200)
      const notification = await resetNotification(t)
      const token = notification!.template!.actionUrl.match(
        /\/reset-password\/([^?]+)/
      )?.[1]
      expect(token).toBeTruthy()

      vi.setSystemTime(new Date("2026-08-27T13:00:01.000Z"))
      const reset = await authPost(t, "/reset-password", {
        token,
        newPassword: "new-valid-password",
      })
      expect(reset.status).not.toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("verified-email publish gate", () => {
  it("continues to block publishing for an unverified signed-in owner", async () => {
    const t = createTest()
    const now = Date.now()
    const user = await t.mutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: "Unverified owner",
          email: "publish-gate@example.com",
          emailVerified: false,
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
          token: "publish-gate-session",
          expiresAt: now + 3_600_000,
          createdAt: now,
          updatedAt: now,
        },
      },
    })
    const client = t.withIdentity({ subject: user._id, sessionId: session._id })
    const eventId = await client.mutation(api.events.create, {
      name: "Ada and Tunde",
      description: "Wedding celebration",
      eventDate: "2027-12-12",
      orderDeadline: "2027-11-30",
      orderDeadlineAt: now + 30 * 24 * 60 * 60 * 1_000,
      timeZone: "Africa/Lagos",
      location: "Lagos",
      contact: "organizer@example.com",
      currency: "NGN",
    })

    const event = await client.query(api.events.get, {
      eventId,
      now,
    })
    expect(
      event?.publishReadiness.missingRequirements.map(({ code }) => code)
    ).toContain("owner_email_unverified")
    await expect(
      client.mutation(api.events.publish, { eventId })
    ).rejects.toThrow("Verify the organizer email address")
  })
})
