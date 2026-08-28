import { TableAggregate } from "@convex-dev/aggregate"

import { components } from "./_generated/api"
import type { DataModel, Doc } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"

const lifecycleTemplateKinds = new Set([
  "guest_order_submitted",
  "organizer_new_order",
  "payment_confirmed",
  "payment_rejected",
  "guest_cancelled",
  "organizer_cancelled",
  "preparing",
  "ready_for_pickup",
  "sent_for_delivery",
  "completed",
])

/**
 * Event-scoped lifecycle email states. Invitations deliberately use their own
 * aggregate, so one logical invitation can never also count as an order email.
 */
export const lifecycleEmailCounts = new TableAggregate<{
  Namespace: string
  Key: string
  DataModel: DataModel
  TableName: "notifications"
}>(components.lifecycleEmailCounts, {
  namespace: (notification) => `${notification.eventId ?? ""}`,
  sortKey: (notification) => notification.status,
})

export function isLifecycleEmail(notification: Doc<"notifications">) {
  return (
    notification.eventId !== undefined &&
    notification.orderRef !== undefined &&
    notification.invitationRef === undefined &&
    lifecycleTemplateKinds.has(notification.templateKind)
  )
}

export async function insertLifecycleEmailAggregate(
  ctx: MutationCtx,
  notification: Doc<"notifications">
) {
  if (isLifecycleEmail(notification)) {
    await lifecycleEmailCounts.insertIfDoesNotExist(ctx, notification)
  }
}

export async function replaceLifecycleEmailAggregate(
  ctx: MutationCtx,
  previous: Doc<"notifications">,
  next: Doc<"notifications">
) {
  const wasLifecycleEmail = isLifecycleEmail(previous)
  const isNowLifecycleEmail = isLifecycleEmail(next)
  if (wasLifecycleEmail && isNowLifecycleEmail) {
    await lifecycleEmailCounts.replaceOrInsert(ctx, previous, next)
  } else if (wasLifecycleEmail) {
    await lifecycleEmailCounts.deleteIfExists(ctx, previous)
  } else if (isNowLifecycleEmail) {
    await lifecycleEmailCounts.insertIfDoesNotExist(ctx, next)
  }
}
