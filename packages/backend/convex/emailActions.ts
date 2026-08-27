"use node"

import { createHash } from "node:crypto"
import type { EmailId } from "@convex-dev/resend"
import { v } from "convex/values"

import { renderNotificationEmail } from "./emailTemplates"
import { emailDeliveryMode, resend } from "./emailProvider"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalAction } from "./_generated/server"
import type { ActionCtx } from "./_generated/server"

function testRecipient(recipient: string) {
  const label = createHash("sha256")
    .update(recipient)
    .digest("hex")
    .slice(0, 16)
  return `delivered+asoebi-${label}@resend.dev`
}

const RECONCILE_INTERVAL = 24 * 60 * 60 * 1_000
const MAX_RECONCILIATION_CHECKS = 28

async function scheduleNextReconciliation(
  ctx: ActionCtx,
  args: {
    notificationId: Id<"notifications">
    attemptNumber: number
    componentEmailId: string
    checkNumber: number
  }
) {
  await ctx.scheduler.runAfter(
    RECONCILE_INTERVAL,
    internal.emailActions.reconcileComponentStatus,
    { ...args, checkNumber: args.checkNumber + 1 }
  )
}

export const renderAndEnqueue = internalAction({
  args: {
    notificationId: v.id("notifications"),
    attemptNumber: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notification = await ctx.runQuery(
      internal.notifications.getForRendering,
      args
    )
    if (!notification || notification.alreadyEnqueued) return null

    try {
      const rendered = await renderNotificationEmail(notification.template)
      await ctx.runMutation(internal.notifications.enqueueRendered, {
        ...args,
        to:
          emailDeliveryMode === "live"
            ? notification.recipient
            : testRecipient(notification.recipient),
        html: rendered.html,
        text: rendered.text,
      })
    } catch (error) {
      await ctx.runMutation(internal.notifications.markAttemptFailed, {
        ...args,
        error: error instanceof Error ? error.message : "Email delivery failed",
      })
    }
    return null
  },
})

export const reconcileComponentStatus = internalAction({
  args: {
    notificationId: v.id("notifications"),
    attemptNumber: v.number(),
    componentEmailId: v.string(),
    checkNumber: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const email = await resend.get(ctx, args.componentEmailId as EmailId)
      if (!email) {
        if (args.checkNumber < MAX_RECONCILIATION_CHECKS) {
          await scheduleNextReconciliation(ctx, args)
          return null
        }
        await ctx.runMutation(internal.notifications.reconcileComponentStatus, {
          notificationId: args.notificationId,
          attemptNumber: args.attemptNumber,
          componentEmailId: args.componentEmailId,
          status: "failed",
          reason: "The provider email record is unavailable.",
          permanent: false,
        })
        return null
      }

      if (email.status === "waiting" || email.status === "queued") {
        if (args.checkNumber < MAX_RECONCILIATION_CHECKS) {
          await scheduleNextReconciliation(ctx, args)
          return null
        }
        await resend.cancelEmail(ctx, args.componentEmailId as EmailId)
        await ctx.runMutation(internal.notifications.reconcileComponentStatus, {
          notificationId: args.notificationId,
          attemptNumber: args.attemptNumber,
          componentEmailId: args.componentEmailId,
          providerId: email.resendId,
          status: "failed",
          reason: "The provider did not finish this delivery within 28 days.",
          permanent: false,
        })
        return null
      }

      const status = email.complained
        ? "complained"
        : email.status === "delivery_delayed"
          ? "delayed"
          : email.status === "cancelled" || email.status === "failed"
            ? "failed"
            : email.status
      await ctx.runMutation(internal.notifications.reconcileComponentStatus, {
        notificationId: args.notificationId,
        attemptNumber: args.attemptNumber,
        componentEmailId: args.componentEmailId,
        providerId: email.resendId,
        status,
        reason: email.errorMessage,
        permanent: status === "bounced" || status === "complained",
      })
    } catch {
      if (args.checkNumber < MAX_RECONCILIATION_CHECKS) {
        await scheduleNextReconciliation(ctx, args)
      } else {
        let cancellationConfirmed = false
        try {
          await resend.cancelEmail(ctx, args.componentEmailId as EmailId)
          cancellationConfirmed = true
        } catch {
          // The app still records the failure, but blocks manual retry when
          // cancellation cannot be confirmed so a duplicate send is impossible.
        }
        await ctx.runMutation(internal.notifications.reconcileComponentStatus, {
          notificationId: args.notificationId,
          attemptNumber: args.attemptNumber,
          componentEmailId: args.componentEmailId,
          status: "failed",
          reason: cancellationConfirmed
            ? "Component status reconciliation did not complete."
            : "Component status and cancellation could not be confirmed.",
          permanent: false,
          retryAllowed: cancellationConfirmed,
        })
      }
    }
    return null
  },
})
