import { TableAggregate } from "@convex-dev/aggregate"

import { components } from "./_generated/api"
import type { DataModel, Doc, Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"

/**
 * Every aggregate is event-namespaced. Events are independent operational
 * units, so this avoids both cross-tenant reads and unnecessary contention.
 */
export const orderPaymentCounts = new TableAggregate<{
  Namespace: Id<"events">
  Key: [string, string]
  DataModel: DataModel
  TableName: "orders"
}>(components.orderPaymentCounts, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => [doc.lifecycle, doc.paymentStatus],
})

export const orderValues = new TableAggregate<{
  Namespace: Id<"events">
  Key: string
  DataModel: DataModel
  TableName: "orders"
}>(components.orderValues, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => doc.lifecycle,
  sumValue: (doc) =>
    doc.lifecycle === "submitted" && doc.progress !== "cancelled"
      ? doc.totalMinor
      : 0,
})

export const orderProgressCounts = new TableAggregate<{
  Namespace: Id<"events">
  Key: [string, string, string]
  DataModel: DataModel
  TableName: "orders"
}>(components.orderProgressCounts, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => [doc.lifecycle, doc.paymentStatus, doc.progress],
})

export const itemDemand = new TableAggregate<{
  Namespace: Id<"events">
  Key: [string, Id<"items">]
  DataModel: DataModel
  TableName: "orderLines"
}>(components.itemDemand, {
  namespace: (doc) => doc.eventId,
  sortKey: (doc) => [doc.lifecycle, doc.itemId],
  sumValue: (doc) => doc.quantity,
})

export async function insertOrderAggregate(
  ctx: MutationCtx,
  order: Doc<"orders">
) {
  await Promise.all([
    orderPaymentCounts.insertIfDoesNotExist(ctx, order),
    orderValues.insertIfDoesNotExist(ctx, order),
    orderProgressCounts.insertIfDoesNotExist(ctx, order),
  ])
}

export async function replaceOrderAggregate(
  ctx: MutationCtx,
  previous: Doc<"orders">,
  next: Doc<"orders">
) {
  await Promise.all([
    orderPaymentCounts.replaceOrInsert(ctx, previous, next),
    orderValues.replaceOrInsert(ctx, previous, next),
    orderProgressCounts.replaceOrInsert(ctx, previous, next),
  ])
}

export async function insertLineAggregate(
  ctx: MutationCtx,
  line: Doc<"orderLines">
) {
  await itemDemand.insertIfDoesNotExist(ctx, line)
}

export async function deleteLineAggregate(
  ctx: MutationCtx,
  line: Doc<"orderLines">
) {
  await itemDemand.deleteIfExists(ctx, line)
}

export async function replaceLineAggregate(
  ctx: MutationCtx,
  previous: Doc<"orderLines">,
  next: Doc<"orderLines">
) {
  await itemDemand.replaceOrInsert(ctx, previous, next)
}
