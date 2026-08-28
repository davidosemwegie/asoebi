import { TableAggregate } from "@convex-dev/aggregate"

import { components } from "./_generated/api"
import type { DataModel, Doc, Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"

const organizerComponents = components as unknown as {
  orderPaymentCounts: any
  orderValues: any
  orderProgressCounts: any
  itemDemand: any
}

/**
 * Every aggregate is event-namespaced. Events are independent operational
 * units, so this avoids both cross-tenant reads and unnecessary contention.
 */
export const orderPaymentCounts = new TableAggregate<{
  Namespace: Id<"events">
  Key: string
  DataModel: DataModel
  TableName: "orders"
}>(organizerComponents.orderPaymentCounts, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => doc.paymentStatus,
})

export const orderValues = new TableAggregate<{
  Namespace: Id<"events">
  Key: string
  DataModel: DataModel
  TableName: "orders"
}>(organizerComponents.orderValues, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => doc.lifecycle,
  sumValue: (doc) =>
    doc.lifecycle === "submitted" && doc.progress !== "cancelled"
      ? doc.totalMinor
      : 0,
})

export const orderProgressCounts = new TableAggregate<{
  Namespace: Id<"events">
  Key: string
  DataModel: DataModel
  TableName: "orders"
}>(organizerComponents.orderProgressCounts, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => doc.progress,
})

export const itemDemand = new TableAggregate<{
  Namespace: Id<"events">
  Key: [string, Id<"items">]
  DataModel: DataModel
  TableName: "orderLines"
}>(organizerComponents.itemDemand, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => [doc.lifecycle, doc.itemId],
  sumValue: (doc) => doc.quantity,
})

export async function insertOrderAggregate(
  ctx: MutationCtx,
  order: Doc<"orders">
) {
  await Promise.all([
    orderPaymentCounts.insert(ctx, order),
    orderValues.insert(ctx, order),
    orderProgressCounts.insert(ctx, order),
  ])
}

export async function replaceOrderAggregate(
  ctx: MutationCtx,
  previous: Doc<"orders">,
  next: Doc<"orders">
) {
  await Promise.all([
    orderPaymentCounts.replace(ctx, previous, next),
    orderValues.replace(ctx, previous, next),
    orderProgressCounts.replace(ctx, previous, next),
  ])
}

export async function insertLineAggregate(
  ctx: MutationCtx,
  line: Doc<"orderLines">
) {
  await itemDemand.insert(ctx, line)
}

export async function deleteLineAggregate(
  ctx: MutationCtx,
  line: Doc<"orderLines">
) {
  await itemDemand.delete(ctx, line)
}

export async function replaceLineAggregate(
  ctx: MutationCtx,
  previous: Doc<"orderLines">,
  next: Doc<"orderLines">
) {
  await itemDemand.replace(ctx, previous, next)
}
