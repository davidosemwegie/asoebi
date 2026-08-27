import { createClient, type GenericCtx } from "@convex-dev/better-auth"
import { convex } from "@convex-dev/better-auth/plugins"
import { betterAuth } from "better-auth/minimal"
import { v } from "convex/values"

import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import { env, query } from "./_generated/server"
import authConfig from "./auth.config"

export const authComponent = createClient<DataModel>(components.betterAuth)

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
      fallback: env.SITE_URL,
      protocol: "auto",
    },
    secret: env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    advanced: {
      useSecureCookies: !env.SITE_URL.startsWith("http://"),
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
