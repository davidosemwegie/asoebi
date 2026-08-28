import { ConvexError, type Infer, v } from "convex/values"
import { paginationOptsValidator } from "convex/server"

import { requireOwnedEvent } from "./eventModel"
import {
  invitationActivityCounts,
  invitationDeliveryCounts,
} from "./eventInvitationAggregates"
import { projectOrderCompletion } from "./eventInvitations"
import { createNotification } from "./notifications"
import type { NotificationTemplate } from "./notificationTypes"
import { appendOrderHistory, releaseReservation } from "./orderModel"
import { normalizeOrderSearch } from "./organizerOrderFilters"
import {
  fulfillmentDetails,
  fulfillmentType,
  orderLifecycle,
  orderProgress,
  paymentStatus,
} from "./schema"
import {
  itemDemand,
  orderPaymentCounts,
  orderProgressCounts,
  orderValues,
  replaceLineAggregate,
  replaceOrderAggregate,
} from "./organizerOrderAggregates"
import { lifecycleEmailCounts } from "./lifecycleEmailAggregates"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  env,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"

const statusFilter = v.optional(
  v.union(
    v.literal("not_submitted"),
    v.literal("pending_review"),
    v.literal("confirmed"),
    v.literal("rejected")
  )
)
const progressFilter = v.optional(
  v.union(
    v.literal("pending"),
    v.literal("preparing"),
    v.literal("ready_for_pickup"),
    v.literal("dispatched"),
    v.literal("fulfilled"),
    v.literal("cancelled")
  )
)
const orderSummaryResult = v.object({
  _id: v.id("orders"),
  reference: v.string(),
  lifecycle: orderLifecycle,
  guestName: v.string(),
  guestEmail: v.optional(v.string()),
  guestPhone: v.optional(v.string()),
  totalMinor: v.number(),
  itemSubtotalMinor: v.number(),
  fulfillmentFeeMinor: v.number(),
  currency: v.string(),
  paymentStatus,
  progress: orderProgress,
  fulfillmentType: v.optional(fulfillmentType),
  fulfillmentOptionName: v.optional(v.string()),
  submittedAt: v.optional(v.number()),
})
const orderLineDetailResult = v.object({
  _id: v.id("orderLines"),
  itemName: v.string(),
  quantity: v.number(),
  lineTotalMinor: v.number(),
  currency: v.string(),
})
const paymentBreakdownResult = v.object({
  not_submitted: v.number(),
  pending_review: v.number(),
  confirmed: v.number(),
  rejected: v.number(),
})
const progressBreakdownResult = v.object({
  pending: v.number(),
  preparing: v.number(),
  ready_for_pickup: v.number(),
  dispatched: v.number(),
  fulfilled: v.number(),
  cancelled: v.number(),
})
const organizerSummaryResult = v.object({
  eventName: v.string(),
  currency: v.string(),
  submittedOrderCount: v.number(),
  currentOrderValueMinor: v.number(),
  paymentsNeedingReview: v.number(),
  completedOrders: v.number(),
  paymentBreakdown: paymentBreakdownResult,
  progressBreakdown: progressBreakdownResult,
  confirmedAwaitingPreparation: v.number(),
  lifecycleEmailNeedsAttention: v.number(),
  lifecycleEmail: v.object({
    scheduled: v.number(),
    queued: v.number(),
    sent: v.number(),
    delivered: v.number(),
    delayed: v.number(),
    failed: v.number(),
    bounced: v.number(),
    complained: v.number(),
    suppressed: v.number(),
  }),
  needsAttention: v.number(),
  items: v.array(
    v.object({
      itemId: v.id("items"),
      name: v.string(),
      requested: v.number(),
      setAside: v.number(),
      available: v.number(),
    })
  ),
  invitations: v.object({
    total: v.number(),
    notSent: v.number(),
    queued: v.number(),
    sent: v.number(),
    delivered: v.number(),
    delayed: v.number(),
    failed: v.number(),
    suppressed: v.number(),
    needsAttention: v.number(),
    ordersSubmitted: v.number(),
    ordersCompleted: v.number(),
  }),
})
const exportRowResult = v.object({
  reference: v.string(),
  guestName: v.string(),
  guestEmail: v.string(),
  guestPhone: v.string(),
  item: v.string(),
  quantity: v.number(),
  unitPriceMinor: v.number(),
  lineTotalMinor: v.number(),
  orderTotalMinor: v.number(),
  currency: v.string(),
  paymentStatus,
  progress: orderProgress,
  fulfillment: v.string(),
  fulfillmentType: v.string(),
  fulfillmentInstructions: v.string(),
  pickupContact: v.string(),
  deliveryRecipientName: v.string(),
  deliveryPhoneNumber: v.string(),
  deliveryAddress: v.string(),
  deliveryAvailability: v.string(),
  deliveryNotes: v.string(),
  submittedAt: v.number(),
  reviewedAt: v.union(v.number(), v.string()),
  fulfilledAt: v.union(v.number(), v.string()),
  timeZone: v.string(),
})
type ExportRow = Infer<typeof exportRowResult>
const listArgs = {
  eventId: v.id("events"),
  paginationOpts: paginationOptsValidator,
  search: v.optional(v.string()),
  itemId: v.optional(v.id("items")),
  paymentStatus: statusFilter,
  progress: progressFilter,
  fulfillmentType: v.optional(
    v.union(v.literal("pickup"), v.literal("delivery"))
  ),
  fulfillmentOptionId: v.optional(v.id("fulfillmentOptions")),
}
const paymentStatuses = ["not_submitted", "pending_review", "confirmed", "rejected"] as const
const progressStatuses = ["pending", "preparing", "ready_for_pickup", "dispatched", "fulfilled", "cancelled"] as const
const lifecycleEmailStatuses = [
  "scheduled",
  "queued",
  "sent",
  "delivered",
  "delayed",
  "failed",
  "bounced",
  "complained",
  "suppressed",
] as const

const orderHistoryResult = v.object({
  _id: v.id("orderStatusHistory"),
  _creationTime: v.number(),
  orderId: v.id("orders"),
  eventId: v.id("events"),
  actorUserId: v.string(),
  actorRole: v.union(
    v.literal("guest"),
    v.literal("organizer"),
    v.literal("system")
  ),
  previousLifecycle: orderLifecycle,
  lifecycle: orderLifecycle,
  previousPaymentStatus: paymentStatus,
  paymentStatus,
  previousProgress: orderProgress,
  progress: orderProgress,
  note: v.optional(v.string()),
  createdAt: v.number(),
})

function submittedPaymentBounds(paymentStatus: string) {
  const key: [string, string] = ["submitted", paymentStatus]
  return {
    lower: { key, inclusive: true },
    upper: { key, inclusive: true },
  }
}

function cancelledProgressBounds(paymentStatus: string) {
  const key: [string, string, string] = [
    "cancelled",
    paymentStatus,
    "cancelled",
  ]
  return {
    lower: { key, inclusive: true },
    upper: { key, inclusive: true },
  }
}
function submittedProgressBounds(progress: string) {
  const key: [string, string, string] = ["submitted", "confirmed", progress]
  return {
    lower: { key, inclusive: true },
    upper: { key, inclusive: true },
  }
}
function submittedPaymentProgressBounds(paymentStatus: string, progress: string) {
  const key: [string, string, string] = ["submitted", paymentStatus, progress]
  return { lower: { key, inclusive: true }, upper: { key, inclusive: true } }
}

function invitationBounds(value: string) {
  return {
    lower: { key: value, inclusive: true },
    upper: { key: value, inclusive: true },
  }
}

function lifecycleEmailBounds(value: string) {
  return {
    lower: { key: value, inclusive: true },
    upper: { key: value, inclusive: true },
  }
}

async function patchLineProjections(ctx: MutationCtx, order: Doc<"orders">) {
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
    .take(100)
  for (const line of lines) {
    await ctx.db.patch(line._id, {
      paymentStatus: order.paymentStatus,
      lifecycle: order.lifecycle,
      progress: order.progress,
      fulfillmentOptionId: order.fulfillmentOptionId,
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(line._id)
    if (updated) await replaceLineAggregate(ctx, line, updated)
  }
}

function summaryOrder(order: Doc<"orders">) {
  return {
    _id: order._id,
    reference: order.reference,
    lifecycle: order.lifecycle,
    guestName: order.guestName ?? "Guest",
    guestEmail: order.guestEmail,
    guestPhone: order.guestPhone,
    totalMinor: order.totalMinor,
    itemSubtotalMinor: order.itemSubtotalMinor,
    fulfillmentFeeMinor: order.fulfillmentFeeMinor,
    currency: order.currency ?? "",
    paymentStatus: order.paymentStatus,
    progress: order.progress,
    fulfillmentType: order.fulfillmentType,
    fulfillmentOptionName: order.fulfillmentOptionName,
    submittedAt: order.submittedAt,
  }
}

type OrderListArgs = {
  eventId: Id<"events">
  paginationOpts: { numItems: number; cursor: string | null }
  search?: string
  itemId?: Id<"items">
  paymentStatus?: Doc<"orders">["paymentStatus"]
  progress?: Doc<"orders">["progress"]
  fulfillmentType?: "pickup" | "delivery"
  fulfillmentOptionId?: Id<"fulfillmentOptions">
}
type OrderCandidateArgs = Omit<OrderListArgs, "paginationOpts">

type CandidateSource =
  | "event"
  | "fulfillmentType"
  | "fulfillmentTypePayment"
  | "fulfillmentTypeProgress"
  | "fulfillmentOption"
  | "fulfillmentOptionPayment"
  | "fulfillmentOptionProgress"
  | "item"
  | "itemPayment"
  | "itemProgress"
  | "payment"
  | "paymentProgress"
  | "progress"
  | "search"

// A request may inspect exactly one bounded candidate page. This prevents a
// sparse combined filter from reading an event's entire order history before
// returning an empty result; the opaque cursor advances to the next slice.
const ORDER_SOURCE_PAGE_SIZE = 25

type OrderListCursor = {
  source: CandidateSource
  sourceCursor: string | null
  pending: string[]
  sourceDone: boolean
  filterKey: string
}

type ExportCursor = {
  source: CandidateSource
  sourceCursor: string | null
  filterKey: string
}

function orderFilterKey(
  args: Pick<
    OrderListArgs,
    | "eventId"
    | "itemId"
    | "paymentStatus"
    | "progress"
    | "fulfillmentType"
    | "fulfillmentOptionId"
  >,
  search: string | undefined
) {
  return JSON.stringify({
    eventId: `${args.eventId}`,
    search,
    itemId: args.itemId ? `${args.itemId}` : undefined,
    paymentStatus: args.paymentStatus,
    progress: args.progress,
    fulfillmentType: args.fulfillmentType,
    fulfillmentOptionId: args.fulfillmentOptionId
      ? `${args.fulfillmentOptionId}`
      : undefined,
  })
}

function candidateSource(
  args: Pick<
    OrderListArgs,
    | "itemId"
    | "paymentStatus"
    | "progress"
    | "fulfillmentType"
    | "fulfillmentOptionId"
  >,
  search: string | undefined
): CandidateSource {
  if (args.itemId)
    return args.paymentStatus
      ? "itemPayment"
      : args.progress
        ? "itemProgress"
        : "item"
  if (search) return "search"
  if (args.fulfillmentOptionId && args.paymentStatus)
    return "fulfillmentOptionPayment"
  if (args.fulfillmentOptionId && args.progress)
    return "fulfillmentOptionProgress"
  if (args.fulfillmentType && args.paymentStatus)
    return "fulfillmentTypePayment"
  if (args.fulfillmentType && args.progress)
    return "fulfillmentTypeProgress"
  if (args.paymentStatus && args.progress) return "paymentProgress"
  if (args.fulfillmentOptionId) return "fulfillmentOption"
  if (args.paymentStatus) return "payment"
  if (args.progress) return "progress"
  if (args.fulfillmentType) return "fulfillmentType"
  return "event"
}

function decodeOrderListCursor(
  cursor: string | null,
  source: CandidateSource,
  filterKey: string
): OrderListCursor {
  if (!cursor)
    return {
      source,
      sourceCursor: null,
      pending: [],
      sourceDone: false,
      filterKey,
    }
  try {
    const decoded = JSON.parse(atob(cursor)) as unknown
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("sourceCursor" in decoded) ||
      !("pending" in decoded) ||
      !Array.isArray(decoded.pending) ||
      !decoded.pending.every((id) => typeof id === "string") ||
      !("source" in decoded) ||
      decoded.source !== source ||
      !("filterKey" in decoded) ||
      decoded.filterKey !== filterKey ||
      !("sourceDone" in decoded) ||
      typeof decoded.sourceDone !== "boolean" ||
      (decoded.sourceCursor !== null &&
        typeof decoded.sourceCursor !== "string")
    )
      throw new Error("invalid")
    return decoded as OrderListCursor
  } catch {
    throw new ConvexError("This order list page has expired. Refresh the list.")
  }
}

function encodeOrderListCursor(cursor: OrderListCursor) {
  return btoa(JSON.stringify(cursor))
}

function decodeExportCursor(
  cursor: string | null,
  source: CandidateSource,
  filterKey: string
): ExportCursor {
  if (!cursor) return { source, sourceCursor: null, filterKey }
  try {
    const decoded = JSON.parse(atob(cursor)) as unknown
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("source" in decoded) ||
      decoded.source !== source ||
      !("sourceCursor" in decoded) ||
      (decoded.sourceCursor !== null &&
        typeof decoded.sourceCursor !== "string") ||
      !("filterKey" in decoded) ||
      decoded.filterKey !== filterKey
    )
      throw new Error("invalid")
    return decoded as ExportCursor
  } catch {
    throw new ConvexError("This export page has expired. Start again.")
  }
}

function encodeExportCursor(cursor: ExportCursor) {
  return btoa(JSON.stringify(cursor))
}

function matchesOrderFilters(
  order: Doc<"orders">,
  args: Pick<
    OrderListArgs,
    | "itemId"
    | "paymentStatus"
    | "progress"
    | "fulfillmentType"
    | "fulfillmentOptionId"
  >,
  search: string | undefined
) {
  // Drafts are private checkout work. Cancelled orders remain part of the
  // organizer record and export, but the aggregate summary excludes them.
  if (order.lifecycle !== "submitted" && order.lifecycle !== "cancelled")
    return false
  if (search && !order.searchText.includes(search)) return false
  if (args.paymentStatus && order.paymentStatus !== args.paymentStatus)
    return false
  if (args.progress && order.progress !== args.progress) return false
  if (
    args.fulfillmentOptionId &&
    order.fulfillmentOptionId !== args.fulfillmentOptionId
  )
    return false
  if (args.fulfillmentType && order.fulfillmentType !== args.fulfillmentType)
    return false
  return true
}

async function lineCandidates(
  ctx: QueryCtx,
  page: {
    page: Array<Doc<"orderLines">>
    continueCursor: string
    isDone: boolean
  }
) {
  const seen = new Set<string>()
  const orderIds: Id<"orders">[] = []
  for (const line of page.page) {
    if (seen.has(`${line.orderId}`)) continue
    seen.add(`${line.orderId}`)
    orderIds.push(line.orderId)
  }
  // normalizeLines guarantees one captured line per item per order. The
  // source page is capped, so these are bounded hydrations, not membership
  // probes across an unbounded result set.
  const orders = (await Promise.all(orderIds.map((orderId) => ctx.db.get(orderId)))).filter(
    (order): order is Doc<"orders"> => order !== null
  )
  return { orders, continueCursor: page.continueCursor, isDone: page.isDone }
}

async function orderCandidates(
  ctx: QueryCtx,
  args: OrderCandidateArgs,
  search: string | undefined,
  source: CandidateSource,
  cursor: string | null,
  numItems: number
) {
  switch (source) {
    case "itemPayment":
      return await lineCandidates(
        ctx,
        await ctx.db
          .query("orderLines")
          .withIndex("by_eventId_and_itemId_and_paymentStatus", (q) =>
            q
              .eq("eventId", args.eventId)
              .eq("itemId", args.itemId!)
              .eq("paymentStatus", args.paymentStatus!)
          )
          .order("desc")
          .paginate({ cursor, numItems })
      )
    case "itemProgress":
      return await lineCandidates(
        ctx,
        await ctx.db
          .query("orderLines")
          .withIndex("by_eventId_and_itemId_and_progress", (q) =>
            q
              .eq("eventId", args.eventId)
              .eq("itemId", args.itemId!)
              .eq("progress", args.progress!)
          )
          .order("desc")
          .paginate({ cursor, numItems })
      )
    case "item":
      return await lineCandidates(
        ctx,
        await ctx.db
          .query("orderLines")
          .withIndex("by_eventId_and_itemId_and_lifecycle", (q) =>
            q.eq("eventId", args.eventId).eq("itemId", args.itemId!)
          )
          .order("desc")
          .paginate({ cursor, numItems })
      )
    case "search": {
      const page = await ctx.db
        .query("orders")
        .withSearchIndex("search_eventId_and_text", (q) => {
          if (args.paymentStatus && args.progress)
            return q
              .search("searchText", search!)
              .eq("eventId", args.eventId)
              .eq("paymentStatus", args.paymentStatus)
              .eq("progress", args.progress)
          if (args.paymentStatus)
            return q
              .search("searchText", search!)
              .eq("eventId", args.eventId)
              .eq("paymentStatus", args.paymentStatus)
          if (args.progress)
            return q
              .search("searchText", search!)
              .eq("eventId", args.eventId)
              .eq("progress", args.progress)
          return q.search("searchText", search!).eq("eventId", args.eventId)
        })
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "fulfillmentOption": {
      const page = await ctx.db
        .query("orders")
        .withIndex("by_eventId_and_fulfillmentOptionId_and_updatedAt", (q) =>
          q
            .eq("eventId", args.eventId)
            .eq("fulfillmentOptionId", args.fulfillmentOptionId!)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "fulfillmentOptionPayment": {
      const page = await ctx.db
        .query("orders")
        .withIndex(
          "by_eventId_option_payment_updated",
          (q) =>
            q
              .eq("eventId", args.eventId)
              .eq("fulfillmentOptionId", args.fulfillmentOptionId!)
              .eq("paymentStatus", args.paymentStatus!)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "fulfillmentOptionProgress": {
      const page = await ctx.db
        .query("orders")
        .withIndex(
          "by_eventId_option_progress_updated",
          (q) =>
            q
              .eq("eventId", args.eventId)
              .eq("fulfillmentOptionId", args.fulfillmentOptionId!)
              .eq("progress", args.progress!)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "payment": {
      const page = await ctx.db
        .query("orders")
        .withIndex("by_eventId_and_paymentStatus_and_updatedAt", (q) =>
          q
            .eq("eventId", args.eventId)
            .eq("paymentStatus", args.paymentStatus!)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "paymentProgress": {
      const page = await ctx.db
        .query("orders")
        .withIndex("by_eventId_payment_progress_updated", (q) =>
          q
            .eq("eventId", args.eventId)
            .eq("paymentStatus", args.paymentStatus!)
            .eq("progress", args.progress!)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "progress": {
      const page = await ctx.db
        .query("orders")
        .withIndex("by_eventId_and_progress_and_updatedAt", (q) =>
          q.eq("eventId", args.eventId).eq("progress", args.progress!)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "fulfillmentType": {
      const page = await ctx.db
        .query("orders")
        .withIndex("by_eventId_and_fulfillmentType_and_updatedAt", (q) =>
          q
            .eq("eventId", args.eventId)
            .eq("fulfillmentType", args.fulfillmentType!)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "fulfillmentTypePayment": {
      const page = await ctx.db
        .query("orders")
        .withIndex(
          "by_eventId_type_payment_updated",
          (q) =>
            q
              .eq("eventId", args.eventId)
              .eq("fulfillmentType", args.fulfillmentType!)
              .eq("paymentStatus", args.paymentStatus!)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "fulfillmentTypeProgress": {
      const page = await ctx.db
        .query("orders")
        .withIndex(
          "by_eventId_type_progress_updated",
          (q) =>
            q
              .eq("eventId", args.eventId)
              .eq("fulfillmentType", args.fulfillmentType!)
              .eq("progress", args.progress!)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
    case "event": {
      const page = await ctx.db
        .query("orders")
        .withIndex("by_eventId_and_updatedAt", (q) =>
          q.eq("eventId", args.eventId)
        )
        .order("desc")
        .paginate({ cursor, numItems })
      return {
        orders: page.page,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
      }
    }
  }
}

async function listOrders(ctx: QueryCtx, args: OrderListArgs) {
  await requireOwnedEvent(ctx, args.eventId)
  const search = normalizeOrderSearch(args.search)
  const requested = Math.min(Math.max(args.paginationOpts.numItems, 1), 50)
  const source = candidateSource(args, search)
  const filterKey = orderFilterKey(args, search)
  const cursor = decodeOrderListCursor(
    args.paginationOpts.cursor,
    source,
    filterKey
  )
  const page: Doc<"orders">[] = []
  const pending = [...cursor.pending]
  let sourceCursor = cursor.sourceCursor
  let sourceDone = cursor.sourceDone
  let pendingReads = 0
  while (
    pending.length > 0 &&
    page.length < requested &&
    pendingReads < ORDER_SOURCE_PAGE_SIZE
  ) {
    const order = await ctx.db.get(pending.shift() as Id<"orders">)
    pendingReads += 1
    if (order && matchesOrderFilters(order, args, search))
      page.push(order)
  }
  if (page.length < requested && !sourceDone) {
    const candidates = await orderCandidates(
      ctx,
      args,
      search,
      source,
      sourceCursor,
      ORDER_SOURCE_PAGE_SIZE
    )
    sourceCursor = candidates.continueCursor
    sourceDone = candidates.isDone
    for (const order of candidates.orders) {
      if (!matchesOrderFilters(order, args, search)) continue
      if (page.length < requested) page.push(order)
      else pending.push(`${order._id}`)
    }
  }
  const resultIsDone = sourceDone && pending.length === 0
  return {
    page: page.map(summaryOrder),
    isDone: resultIsDone,
    continueCursor: resultIsDone
      ? ""
      : encodeOrderListCursor({
          source,
          sourceCursor,
          pending,
          sourceDone,
          filterKey,
        }),
  }
}

export const list = query({
  args: listArgs,
  returns: v.object({
    page: v.array(orderSummaryResult),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: listOrders,
})

export const getSummary = query({
  args: { eventId: v.id("events") },
  returns: organizerSummaryResult,
  handler: async (ctx, { eventId }) => {
    const event = await requireOwnedEvent(ctx, eventId)
    const [
      submitted,
      value,
      needsPaymentCheck,
      completed,
      confirmedAwaitingPreparation,
      items,
      notSent,
      queued,
      sent,
      delivered,
      delayed,
      failed,
      suppressed,
      ordersSubmitted,
      ordersCompleted,
    ] = await Promise.all([
      orderValues.count(ctx, {
        namespace: eventId,
        bounds: {
          lower: { key: "submitted", inclusive: true },
          upper: { key: "submitted", inclusive: true },
        },
      }),
      orderValues.sum(ctx, { namespace: eventId }),
      orderPaymentCounts.count(ctx, {
        namespace: eventId,
        bounds: submittedPaymentBounds("pending_review"),
      }),
      orderProgressCounts.count(ctx, {
        namespace: eventId,
        bounds: submittedProgressBounds("fulfilled"),
      }),
      orderProgressCounts.count(ctx, {
        namespace: eventId,
        bounds: submittedProgressBounds("pending"),
      }),
      ctx.db
        .query("items")
        .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
        .take(100),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("not_sent"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("queued"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("sent"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("delivered"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("delayed"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("failed"),
      }),
      invitationDeliveryCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("suppressed"),
      }),
      invitationActivityCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("order_submitted"),
      }),
      invitationActivityCounts.count(ctx, {
        namespace: eventId,
        bounds: invitationBounds("order_completed"),
      }),
    ])
    const demand = await Promise.all(
      items.map(async (item) => ({
        item,
        requested: await itemDemand.sum(ctx, {
          namespace: eventId,
          bounds: {
            lower: { key: ["submitted", item._id], inclusive: true },
            upper: { key: ["submitted", item._id], inclusive: true },
          },
        }),
      }))
    )
    const paymentCounts = await Promise.all(
      paymentStatuses.map(async (paymentStatus) => [
        paymentStatus,
        await orderPaymentCounts.count(ctx, { namespace: eventId, bounds: submittedPaymentBounds(paymentStatus) }),
      ] as const)
    )
    const lifecycleCounts = await Promise.all(
      lifecycleEmailStatuses.map((status) =>
        lifecycleEmailCounts.count(ctx, {
          namespace: `${eventId}`,
          bounds: lifecycleEmailBounds(status),
        })
      )
    )
    const lifecycleEmailNeedsAttention =
      lifecycleCounts[4]! +
      lifecycleCounts[5]! +
      lifecycleCounts[6]! +
      lifecycleCounts[7]! +
      lifecycleCounts[8]!
    const progressCounts = await Promise.all(
      progressStatuses.map(async (progress) => {
        const counts = await Promise.all(
          paymentStatuses.map((paymentStatus) => {
            const bounds =
              progress === "cancelled"
                ? cancelledProgressBounds(paymentStatus)
                : submittedPaymentProgressBounds(paymentStatus, progress)
            return orderProgressCounts.count(ctx, {
              namespace: eventId,
              bounds,
            })
          })
        )
        return [progress, counts.reduce((sum, value) => sum + value, 0)] as const
      })
    )
    return {
      eventName: event.name,
      currency: event.currency,
      submittedOrderCount: submitted,
      currentOrderValueMinor: value,
      paymentsNeedingReview: needsPaymentCheck,
      completedOrders: completed,
      paymentBreakdown: {
        not_submitted: paymentCounts[0]![1],
        pending_review: paymentCounts[1]![1],
        confirmed: paymentCounts[2]![1],
        rejected: paymentCounts[3]![1],
      },
      progressBreakdown: {
        pending: progressCounts[0]![1],
        preparing: progressCounts[1]![1],
        ready_for_pickup: progressCounts[2]![1],
        dispatched: progressCounts[3]![1],
        fulfilled: progressCounts[4]![1],
        cancelled: progressCounts[5]![1],
      },
      confirmedAwaitingPreparation,
      lifecycleEmailNeedsAttention,
      lifecycleEmail: {
        scheduled: lifecycleCounts[0]!,
        queued: lifecycleCounts[1]!,
        sent: lifecycleCounts[2]!,
        delivered: lifecycleCounts[3]!,
        delayed: lifecycleCounts[4]!,
        failed: lifecycleCounts[5]!,
        bounced: lifecycleCounts[6]!,
        complained: lifecycleCounts[7]!,
        suppressed: lifecycleCounts[8]!,
      },
      needsAttention:
        needsPaymentCheck +
        confirmedAwaitingPreparation +
        delayed +
        failed +
        suppressed +
        lifecycleEmailNeedsAttention,
      items: demand.map(({ item, requested }) => ({
        itemId: item._id,
        name: item.name,
        requested,
        setAside: item.reservedQuantity,
        available: Math.max(0, item.inventoryTotal - item.reservedQuantity),
      })),
      invitations: {
        total:
          notSent + queued + sent + delivered + delayed + failed + suppressed,
        notSent,
        queued,
        sent,
        delivered,
        delayed,
        failed,
        suppressed,
        needsAttention: delayed + failed + suppressed,
        ordersSubmitted,
        ordersCompleted,
      },
    }
  },
})

export const getDetail = query({
  args: { eventId: v.id("events"), orderId: v.id("orders") },
  returns: v.union(
    v.object({
      order: orderSummaryResult,
      eventTimeZone: v.string(),
      lines: v.array(orderLineDetailResult),
      history: v.array(orderHistoryResult),
      receiptAvailable: v.boolean(),
      fulfillmentDetails: v.optional(fulfillmentDetails),
      fulfillmentOptionName: v.optional(v.string()),
      fulfillmentType: v.optional(fulfillmentType),
      fulfillmentInstructions: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (!order || order.eventId !== args.eventId) return null
    const [lines, history, proof] = await Promise.all([
      ctx.db
        .query("orderLines")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(100),
      ctx.db
        .query("orderStatusHistory")
        .withIndex("by_orderId_and_createdAt", (q) =>
          q.eq("orderId", order._id)
        )
        .order("desc")
        .take(50),
      order.currentProofId ? ctx.db.get(order.currentProofId) : null,
    ])
    return {
      order: summaryOrder(order),
      eventTimeZone: event.timeZone ?? "UTC",
      lines: lines.map((line) => ({
        _id: line._id,
        itemName: line.itemName,
        quantity: line.quantity,
        lineTotalMinor: line.lineTotalMinor,
        currency: line.currency,
      })),
      history,
      receiptAvailable: Boolean(proof?.status === "active"),
      fulfillmentDetails: order.fulfillmentDetails,
      fulfillmentOptionName: order.fulfillmentOptionName,
      fulfillmentType: order.fulfillmentType,
      fulfillmentInstructions: order.fulfillmentInstructions,
    }
  },
})

export const listHistory = query({
  args: {
    eventId: v.id("events"),
    orderId: v.id("orders"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(orderHistoryResult),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (!order || order.eventId !== event._id)
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      }
    return await ctx.db
      .query("orderStatusHistory")
      .withIndex("by_orderId_and_createdAt", (q) => q.eq("orderId", order._id))
      .order("desc")
      .paginate(args.paginationOpts)
  },
})

export const getExportPage = internalQuery({
  args: {
    eventId: v.id("events"),
    cursor: v.union(v.string(), v.null()),
    search: v.optional(v.string()),
    paymentStatus: statusFilter,
    progress: progressFilter,
    fulfillmentOptionId: v.optional(v.id("fulfillmentOptions")),
    fulfillmentType: v.optional(
      v.union(v.literal("pickup"), v.literal("delivery"))
    ),
    itemId: v.optional(v.id("items")),
  },
  returns: v.object({
    rows: v.array(exportRowResult),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const search = normalizeOrderSearch(args.search)
    const source = candidateSource(args, search)
    const filterKey = orderFilterKey(args, search)
    const cursor = decodeExportCursor(args.cursor, source, filterKey)
    const page = await orderCandidates(
      ctx,
      args,
      search,
      source,
      cursor.sourceCursor,
      ORDER_SOURCE_PAGE_SIZE
    )
    const rows: ExportRow[] = []
    for (const order of page.orders) {
      if (!matchesOrderFilters(order, args, search)) continue
      const lines = await ctx.db
        .query("orderLines")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(100)
      // Item filtering selects an order. Once selected, a spreadsheet keeps
      // its complete captured record: one row for every line in that order.
      for (const line of lines)
        rows.push({
          reference: order.reference,
          guestName: order.guestName ?? "",
          guestEmail: order.guestEmail ?? "",
          guestPhone: order.guestPhone ?? "",
          item: line.itemName,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          lineTotalMinor: line.lineTotalMinor,
          orderTotalMinor: order.totalMinor,
          currency: order.currency ?? "",
          paymentStatus: order.paymentStatus,
          progress: order.progress,
          fulfillment: order.fulfillmentOptionName ?? "",
          fulfillmentType: order.fulfillmentType ?? "",
          fulfillmentInstructions: order.fulfillmentInstructions ?? "",
          pickupContact: order.fulfillmentDetails?.pickupContact ?? "",
          deliveryRecipientName:
            order.fulfillmentDetails?.recipientName ?? "",
          deliveryPhoneNumber: order.fulfillmentDetails?.phoneNumber ?? "",
          deliveryAddress: order.fulfillmentDetails?.address ?? "",
          deliveryAvailability: order.fulfillmentDetails?.availability ?? "",
          deliveryNotes: order.fulfillmentDetails?.notes ?? "",
          submittedAt: order.submittedAt ?? order.createdAt,
          reviewedAt: order.reviewedAt ?? "",
          fulfilledAt: order.progress === "fulfilled" ? order.updatedAt : "",
          timeZone: event.timeZone ?? "UTC",
        })
    }
    return {
      rows,
      continueCursor: page.isDone
        ? ""
        : encodeExportCursor({
            source,
            sourceCursor: page.continueCursor,
            filterKey,
          }),
      isDone: page.isDone,
    }
  },
})

type LifecycleNotificationKind =
  | "payment_confirmed"
  | "payment_rejected"
  | "organizer_cancelled"
  | "preparing"
  | "ready_for_pickup"
  | "sent_for_delivery"
  | "completed"

function lifecycleTemplate(
  kind: LifecycleNotificationKind,
  payload: {
    recipientName: string
    eventName: string
    orderReference: string
    actionUrl: string
  }
): NotificationTemplate {
  switch (kind) {
    case "payment_confirmed":
      return { kind: "payment_confirmed", ...payload }
    case "payment_rejected":
      return { kind: "payment_rejected", ...payload }
    case "organizer_cancelled":
      return { kind: "organizer_cancelled", ...payload }
    case "preparing":
      return { kind: "preparing", ...payload }
    case "ready_for_pickup":
      return { kind: "ready_for_pickup", ...payload }
    case "sent_for_delivery":
      return { kind: "sent_for_delivery", ...payload }
    case "completed":
      return { kind: "completed", ...payload }
  }
}

function normalizePaymentDecisionNote(value: string | undefined) {
  const note = value?.trim()
  if (!note) return undefined
  if (note.length > 500) throw new ConvexError("Payment note is too long.")
  return note
}

async function notify(
  ctx: MutationCtx,
  order: Doc<"orders">,
  transitionId: Id<"orderStatusHistory">,
  kind: LifecycleNotificationKind
) {
  const event = await ctx.db.get(order.eventId)
  if (!event || !order.guestEmail || !order.guestName) return
  await createNotification(ctx, {
    dedupeKey: `order:${kind}:${order._id}:${transitionId}`,
    recipient: order.guestEmail,
    ownerId: event.ownerId,
    eventId: event._id,
    eventRef: `${event._id}`,
    orderRef: `${order._id}`,
    template: lifecycleTemplate(kind, {
      recipientName: order.guestName,
      eventName: event.name,
      orderReference: order.reference,
      actionUrl: `${env.SITE_URL}/orders/${order._id}`,
    }),
  })
}

export const decidePayment = mutation({
  args: {
    eventId: v.id("events"),
    orderId: v.id("orders"),
    decision: v.union(v.literal("confirmed"), v.literal("rejected")),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const note = normalizePaymentDecisionNote(args.note)
    const order = await ctx.db.get(args.orderId)
    if (
      !order ||
      order.eventId !== event._id ||
      order.lifecycle !== "submitted" ||
      order.paymentStatus !== "pending_review"
    )
      throw new ConvexError("This payment decision is no longer available.")
    if (args.decision === "rejected") await releaseReservation(ctx, order)
    await ctx.db.patch(order._id, {
      paymentStatus: args.decision,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order not found.")
    await replaceOrderAggregate(ctx, order, updated)
    await patchLineProjections(ctx, updated)
    const transitionId = await appendOrderHistory(ctx, {
      order,
      actorUserId: event.ownerId,
      actorRole: "organizer",
      paymentStatus: args.decision,
      note,
    })
    await ctx.scheduler.runAfter(0, internal.organizerOrders.notifyLifecycle, {
      orderId: updated._id,
      transitionId,
      kind:
        args.decision === "confirmed"
          ? "payment_confirmed"
          : "payment_rejected",
    })
    return null
  },
})

export const advanceFulfillment = mutation({
  args: { eventId: v.id("events"), orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (
      !order ||
      order.eventId !== event._id ||
      order.lifecycle !== "submitted" ||
      order.paymentStatus !== "confirmed"
    )
      throw new ConvexError("This order is not ready to move forward.")
    const pickupTransitions: Partial<
      Record<Doc<"orders">["progress"], Doc<"orders">["progress"]>
    > = {
      pending: "preparing",
      preparing: "ready_for_pickup",
      ready_for_pickup: "fulfilled",
    }
    const deliveryTransitions: Partial<
      Record<Doc<"orders">["progress"], Doc<"orders">["progress"]>
    > = {
      pending: "preparing",
      preparing: "dispatched",
      dispatched: "fulfilled",
    }
    const next =
      order.fulfillmentType === "pickup"
        ? pickupTransitions[order.progress]
        : deliveryTransitions[order.progress]
    if (!next)
      throw new ConvexError("There is no next fulfillment step for this order.")
    await ctx.db.patch(order._id, { progress: next, updatedAt: Date.now() })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order not found.")
    await replaceOrderAggregate(ctx, order, updated)
    await patchLineProjections(ctx, updated)
    const transitionId = await appendOrderHistory(ctx, {
      order,
      actorUserId: event.ownerId,
      actorRole: "organizer",
      progress: next,
    })
    if (next === "fulfilled") {
      await projectOrderCompletion(ctx, {
        eventId: event._id,
        email: updated.guestEmail,
        orderId: updated._id,
      })
    }
    const kind =
      next === "preparing"
        ? "preparing"
        : next === "ready_for_pickup"
          ? "ready_for_pickup"
          : next === "dispatched"
            ? "sent_for_delivery"
            : "completed"
    await ctx.scheduler.runAfter(0, internal.organizerOrders.notifyLifecycle, {
      orderId: updated._id,
      transitionId,
      kind,
    })
    return null
  },
})

export const cancel = mutation({
  args: {
    eventId: v.id("events"),
    orderId: v.id("orders"),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await requireOwnedEvent(ctx, args.eventId)
    const order = await ctx.db.get(args.orderId)
    if (
      !order ||
      order.eventId !== event._id ||
      order.lifecycle !== "submitted" ||
      order.progress === "fulfilled"
    )
      throw new ConvexError("This order cannot be cancelled.")
    await releaseReservation(ctx, order)
    await ctx.db.patch(order._id, {
      lifecycle: "cancelled",
      progress: "cancelled",
      cancelledAt: Date.now(),
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(order._id)
    if (!updated) throw new Error("Order not found.")
    await replaceOrderAggregate(ctx, order, updated)
    await patchLineProjections(ctx, updated)
    const transitionId = await appendOrderHistory(ctx, {
      order,
      actorUserId: event.ownerId,
      actorRole: "organizer",
      lifecycle: "cancelled",
      progress: "cancelled",
      note: args.note,
    })
    await ctx.scheduler.runAfter(0, internal.organizerOrders.notifyLifecycle, {
      orderId: updated._id,
      transitionId,
      kind: "organizer_cancelled",
    })
    return null
  },
})

export const notifyLifecycle = internalMutation({
  args: {
    orderId: v.id("orders"),
    transitionId: v.id("orderStatusHistory"),
    kind: v.union(
      v.literal("payment_confirmed"),
      v.literal("payment_rejected"),
      v.literal("organizer_cancelled"),
      v.literal("preparing"),
      v.literal("ready_for_pickup"),
      v.literal("sent_for_delivery"),
      v.literal("completed")
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId)
    if (order) await notify(ctx, order, args.transitionId, args.kind)
    return null
  },
})
