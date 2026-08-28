import betterAuth from "@convex-dev/better-auth/convex.config"
import aggregate from "@convex-dev/aggregate/convex.config.js"
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
app.use(aggregate, { name: "invitationDeliveryCounts" })
app.use(aggregate, { name: "invitationActivityCounts" })
app.use(aggregate, { name: "orderPaymentCounts" })
app.use(aggregate, { name: "orderValues" })
app.use(aggregate, { name: "orderProgressCounts" })
app.use(aggregate, { name: "itemDemand" })

export default app
