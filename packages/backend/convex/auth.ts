import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex } from "@convex-dev/better-auth/plugins"
import { requireRunMutationCtx } from "@convex-dev/better-auth/utils"
import { betterAuth } from "better-auth/minimal"
import { v } from "convex/values"

import { components, internal } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import { env, internalQuery, query } from "./_generated/server"
import authConfig from "./auth.config"

export const authComponent = createClient<DataModel>(components.betterAuth)

async function tokenDigest(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  )
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

async function enqueueAuthEmail(
  ctx: GenericCtx<DataModel>,
  args: {
    kind: "verify_email" | "reset_password"
    user: { id: string; email: string; name: string }
    url: string
    token: string
  }
) {
  try {
    const runCtx = requireRunMutationCtx(ctx)
    const digest = await tokenDigest(args.token)
    await runCtx.runMutation(internal.notifications.enqueueInternal, {
      dedupeKey: `auth:${args.kind}:${digest}`,
      recipient: args.user.email,
      ownerId: args.user.id,
      payloadExpiresAt: Date.now() + 60 * 60 * 1_000,
      template:
        args.kind === "reset_password"
          ? {
              kind: "reset_password",
              recipientName: args.user.name,
              actionUrl: args.url,
              expiresInMinutes: 60,
            }
          : {
              kind: "verify_email",
              recipientName: args.user.name,
              actionUrl: args.url,
            },
    })
  } catch (error) {
    console.error(`Could not schedule ${args.kind} email`, error)
  }
}

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    appName: "Aso Circle",
    baseURL: {
      allowedHosts: [
        "localhost:3000",
        "127.0.0.1:3000",
        "davids-mac-mini.tailfca955.ts.net:3000",
        "asoebi-web.vercel.app",
        "asoebi-clearjar-studio.vercel.app",
        "asoebi-*-clearjar-studio.vercel.app",
      ],
      fallback: env.SITE_URL ?? "http://localhost:3000",
      protocol: "auto",
    },
    secret: env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailVerification: {
      expiresIn: 60 * 60,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        await enqueueAuthEmail(ctx, {
          kind: "verify_email",
          user,
          url,
          token,
        })
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        await enqueueAuthEmail(ctx, {
          kind: "reset_password",
          user,
          url,
          token,
        })
      },
    },
    advanced: {
      useSecureCookies: !(env.SITE_URL ?? "http://localhost:3000").startsWith(
        "http://"
      ),
    },
    plugins: [convex({ authConfig })],
  })

export const getCurrentUser = query({
  args: {},
  returns: v.object({
    name: v.string(),
    email: v.string(),
    image: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx)

    return {
      name: user.name,
      email: user.email,
      image: user.image ?? null,
    }
  },
})

/** Internal, server-side user lookup for durable notification jobs. */
export const getUserForNotification = internalQuery({
  args: { userId: v.string() },
  returns: v.union(v.object({ name: v.string(), email: v.string() }), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", value: userId }],
    })
    if (
      !user ||
      typeof user.name !== "string" ||
      typeof user.email !== "string"
    )
      return null
    return { name: user.name, email: user.email }
  },
})
