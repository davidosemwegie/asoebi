import { TableAggregate } from "@convex-dev/aggregate"

import { components } from "./_generated/api"
import type { DataModel, Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"

export const invitationDeliveryCounts = new TableAggregate<{
  Namespace: Id<"events">
  Key: string
  DataModel: DataModel
  TableName: "eventInvitations"
}>(components.invitationDeliveryCounts, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => doc.latestDeliveryState,
})

export const invitationActivityCounts = new TableAggregate<{
  Namespace: Id<"events">
  Key: string
  DataModel: DataModel
  TableName: "eventInvitations"
}>(components.invitationActivityCounts, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => doc.activity,
})

export async function clearInvitationAggregateNamespaces(
  ctx: MutationCtx,
  eventId: Id<"events">
) {
  await Promise.all([
    invitationDeliveryCounts.clear(ctx, { namespace: eventId }),
    invitationActivityCounts.clear(ctx, { namespace: eventId }),
  ])
}
