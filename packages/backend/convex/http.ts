import { Webhook } from "svix"
import { httpRouter } from "convex/server"

import { authComponent, createAuth } from "./auth"
import { resend } from "./emailProvider"
import { internal } from "./_generated/api"
import { env, httpAction, type ActionCtx } from "./_generated/server"

const http = httpRouter()
const PUBLIC_EVENT_COVER_PREFIX = "/public-event-cover/v1/"

authComponent.registerRoutes(http, createAuth)

export async function servePublicEventCover(ctx: ActionCtx, request: Request) {
  const pathname = new URL(request.url).pathname
  const [coverVersion, shareToken, ...extraSegments] = pathname
    .slice(PUBLIC_EVENT_COVER_PREFIX.length)
    .split("/")
  if (
    extraSegments.length > 0 ||
    !/^[a-z0-9]{14}$/.test(coverVersion ?? "") ||
    !/^[A-Za-z0-9_-]{32}$/.test(shareToken ?? "")
  ) {
    return new Response("Not found", { status: 404 })
  }

  const cover = await ctx.runQuery(internal.sharedEvents.getCoverForProxy, {
    shareToken: shareToken!,
    coverVersion: coverVersion!,
  })
  if (!cover) return new Response("Not found", { status: 404 })

  const bytes = await ctx.storage.get(cover.storageId)
  if (!bytes) return new Response("Not found", { status: 404 })

  return new Response(bytes, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": cover.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

http.route({
  pathPrefix: PUBLIC_EVENT_COVER_PREFIX,
  method: "GET",
  handler: httpAction(servePublicEventCover),
})

http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = env.RESEND_WEBHOOK_SECRET
    if (!webhookSecret) {
      return new Response("Webhook is not configured", { status: 503 })
    }

    const raw = await request.clone().text()
    let payload: unknown
    try {
      payload = new Webhook(webhookSecret).verify(raw, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      })
    } catch {
      return new Response("Invalid webhook signature", { status: 400 })
    }

    if (
      typeof payload === "object" &&
      payload !== null &&
      "type" in payload &&
      payload.type === "email.suppressed" &&
      "created_at" in payload &&
      typeof payload.created_at === "string" &&
      "data" in payload &&
      typeof payload.data === "object" &&
      payload.data !== null &&
      "email_id" in payload.data &&
      typeof payload.data.email_id === "string"
    ) {
      await ctx.runMutation(internal.notifications.handleSuppressedEvent, {
        providerId: payload.data.email_id,
        createdAt: payload.created_at,
        reason:
          "suppressed" in payload.data &&
          typeof payload.data.suppressed === "object" &&
          payload.data.suppressed !== null &&
          "message" in payload.data.suppressed &&
          typeof payload.data.suppressed.message === "string"
            ? payload.data.suppressed.message
            : undefined,
      })
      return new Response(null, { status: 201 })
    }

    return await resend.handleResendEventWebhook(ctx, request)
  }),
})

export default http
