import betterAuth from "@convex-dev/better-auth/convex.config"
import resend from "@convex-dev/resend/convex.config"
import { defineApp } from "convex/server"
import { v } from "convex/values"

const app = defineApp({
  env: {
    BETTER_AUTH_SECRET: v.string(),
    SITE_URL: v.string(),
    RESEND_API_KEY: v.optional(v.string()),
    RESEND_WEBHOOK_SECRET: v.optional(v.string()),
    EMAIL_FROM: v.optional(v.string()),
    EMAIL_DELIVERY_MODE: v.optional(
      v.union(v.literal("test"), v.literal("live"))
    ),
  },
})

app.use(betterAuth)
app.use(resend)

export default app
