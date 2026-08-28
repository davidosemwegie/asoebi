import { ConvexError } from "convex/values"

import { authComponent } from "./auth"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

export const MAX_ORDER_LINES = 100
export const MAX_QUANTITY = 1_000_000
export const MAX_REQUEST_ID_LENGTH = 100
export const REQUEST_RECEIPT_TTL = 24 * 60 * 60 * 1_000

export type OrderContext = MutationCtx | QueryCtx
export type OrderLineInput = { itemId: Id<"items">; quantity: number }
export type FulfillmentInput = {
  optionId: Id<"fulfillmentOptions">
  pickupContact?: string
  recipientName?: string
  phoneNumber?: string
  address?: string
  availability?: string
  notes?: string
}

export async function getCurrentUser(ctx: OrderContext) {
  return await authComponent.getAuthUser(ctx)
}

export async function requireAttendeeForEvent(
  ctx: OrderContext,
  eventId: Id<"events">
) {
  const user = await getCurrentUser(ctx)
  const attendee = await ctx.db
    .query("eventAttendees")
    .withIndex("by_eventId_and_userId", (q) =>
      q.eq("eventId", eventId).eq("userId", user._id)
    )
    .unique()
  if (!attendee) throw new ConvexError("Start from this event's private link.")
  return { attendee, user }
}

export function requireOpenEvent(event: Doc<"events">) {
  if (
    event.status !== "published" ||
    event.orderDeadlineAt === undefined ||
    event.orderDeadlineAt <= Date.now()
  ) {
    throw new ConvexError("This event is no longer accepting order changes.")
  }
}

export function requireVerifiedEmail(user: {
  email: string
  emailVerified?: boolean
}) {
  if (user.emailVerified !== true) {
    throw new ConvexError(
      "Verify your email address before submitting an order."
    )
  }
}

function safeText(value: string | undefined, name: string, max = 500) {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > max) throw new ConvexError(`${name} is too long.`)
  return trimmed
}

function sumMinor(values: number[]) {
  let total = 0
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ConvexError("Order totals are not valid.")
    }
    total += value
    if (!Number.isSafeInteger(total)) {
      throw new ConvexError("Order total is too large.")
    }
  }
  return total
}

export function normalizeLines(lines: OrderLineInput[]) {
  if (lines.length === 0) throw new ConvexError("Choose at least one item.")
  if (lines.length > MAX_ORDER_LINES)
    throw new ConvexError("Too many items in one order.")
  const quantities = new Map<Id<"items">, number>()
  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > MAX_QUANTITY
    ) {
      throw new ConvexError("Choose a valid whole-number quantity.")
    }
    if (quantities.has(line.itemId))
      throw new ConvexError("Each item can appear once.")
    quantities.set(line.itemId, line.quantity)
  }
  return quantities
}

function normalizeFulfillmentDetails(input: FulfillmentInput) {
  return {
    pickupContact: safeText(input.pickupContact, "Pickup contact", 160),
    recipientName: safeText(input.recipientName, "Recipient name", 160),
    phoneNumber: safeText(input.phoneNumber, "Phone number", 80),
    address: safeText(input.address, "Address", 800),
    availability: safeText(input.availability, "Delivery availability", 500),
    notes: safeText(input.notes, "Notes", 800),
  }
}

function validateRequiredDetails(
  option: Doc<"fulfillmentOptions">,
  details: ReturnType<typeof normalizeFulfillmentDetails>
) {
  const required = option.requiredFields
  if (required.kind === "pickup") {
    if (required.pickupContact && !details.pickupContact) {
      throw new ConvexError(
        "Enter the pickup contact required for this option."
      )
    }
    return
  }
  const fields: Array<[boolean, string | undefined, string]> = [
    [required.recipientName, details.recipientName, "recipient name"],
    [required.phoneNumber, details.phoneNumber, "phone number"],
    [required.address, details.address, "delivery address"],
    [required.availability, details.availability, "delivery availability"],
    [required.notes, details.notes, "delivery notes"],
  ]
  for (const [isRequired, value, label] of fields) {
    if (isRequired && !value)
      throw new ConvexError(`Enter the required ${label}.`)
  }
}

export async function buildOrderSnapshot(
  ctx: MutationCtx,
  args: {
    event: Doc<"events">
    lines: OrderLineInput[]
    fulfillment: FulfillmentInput
    previousLines?: Doc<"orderLines">[]
    previousOrder?: Doc<"orders">
    validateRequired?: boolean
  }
) {
  const quantities = normalizeLines(args.lines)
  const option = await ctx.db.get(args.fulfillment.optionId)
  if (!option || option.eventId !== args.event._id) {
    throw new ConvexError("Choose a fulfillment option for this event.")
  }
  const previousKeepsOption =
    args.previousOrder?.fulfillmentOptionId === option._id &&
    args.previousOrder.fulfillmentOptionName !== undefined &&
    args.previousOrder.fulfillmentType !== undefined &&
    args.previousOrder.fulfillmentRequiredFields !== undefined &&
    args.previousOrder.fulfillmentDetails !== undefined
  const previousOrder = args.previousOrder
  if (!previousKeepsOption && !option.enabled) {
    throw new ConvexError("Choose an available pickup or delivery option.")
  }
  const details = normalizeFulfillmentDetails(args.fulfillment)
  if (args.validateRequired !== false) validateRequiredDetails(option, details)
  const oldByItem = new Map(
    args.previousLines?.map((line) => [line.itemId, line])
  )
  const lines: Array<{
    itemId: Id<"items">
    itemName: string
    itemDescription?: string
    unitLabel: string
    quantity: number
    unitPriceMinor: number
    lineTotalMinor: number
  }> = []
  for (const [itemId, quantity] of quantities) {
    const item = await ctx.db.get(itemId)
    if (!item || item.eventId !== args.event._id || item.isHidden) {
      throw new ConvexError("One of the selected items is no longer available.")
    }
    const previous = oldByItem.get(itemId)
    const unitPriceMinor = previous?.unitPriceMinor ?? item.priceMinor
    if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 0) {
      throw new ConvexError("An item price is not valid.")
    }
    const lineTotalMinor = unitPriceMinor * quantity
    if (!Number.isSafeInteger(lineTotalMinor)) {
      throw new ConvexError("Order total is too large.")
    }
    lines.push({
      itemId,
      itemName: previous?.itemName ?? item.name,
      itemDescription: previous?.itemDescription ?? item.description,
      unitLabel: previous?.unitLabel ?? item.unitLabel,
      quantity,
      unitPriceMinor,
      lineTotalMinor,
    })
  }
  const itemSubtotalMinor = sumMinor(lines.map((line) => line.lineTotalMinor))
  const fulfillmentFeeMinor = previousKeepsOption
    ? previousOrder!.fulfillmentFeeMinor
    : option.feeMinor
  const totalMinor = sumMinor([itemSubtotalMinor, fulfillmentFeeMinor])
  return {
    lines,
    itemSubtotalMinor,
    fulfillmentFeeMinor,
    totalMinor,
    fulfillmentOptionId: option._id,
    fulfillmentOptionName: previousKeepsOption
      ? previousOrder!.fulfillmentOptionName!
      : option.name,
    fulfillmentType: previousKeepsOption
      ? previousOrder!.fulfillmentType!
      : option.type,
    fulfillmentInstructions: previousKeepsOption
      ? previousOrder!.fulfillmentInstructions
      : option.instructions,
    fulfillmentRequiredFields: previousKeepsOption
      ? previousOrder!.fulfillmentRequiredFields!
      : option.requiredFields,
    fulfillmentDetails: details,
  }
}

export async function adjustReservations(
  ctx: MutationCtx,
  previousLines: Doc<"orderLines">[],
  nextLines: Array<{ itemId: Id<"items">; quantity: number }>
) {
  const previous = new Map(
    previousLines.map((line) => [line.itemId, line.quantity])
  )
  const next = new Map(nextLines.map((line) => [line.itemId, line.quantity]))
  const itemIds = new Set<Id<"items">>([...previous.keys(), ...next.keys()])
  const patches: Array<{ item: Doc<"items">; delta: number }> = []
  for (const itemId of itemIds) {
    const delta = (next.get(itemId) ?? 0) - (previous.get(itemId) ?? 0)
    if (!delta) continue
    const item = await ctx.db.get(itemId)
    if (!item) throw new ConvexError("An ordered item is no longer available.")
    const reserved = item.reservedQuantity + delta
    if (
      !Number.isSafeInteger(reserved) ||
      reserved < 0 ||
      reserved > item.inventoryTotal
    ) {
      throw new ConvexError("There is not enough inventory for this order.")
    }
    patches.push({ item, delta })
  }
  for (const { item, delta } of patches) {
    await ctx.db.patch(item._id, {
      reservedQuantity: item.reservedQuantity + delta,
      updatedAt: Date.now(),
    })
  }
}

/** Future payment decisions call this to make release exactly once. */
export async function releaseReservation(
  ctx: MutationCtx,
  order: Doc<"orders">
) {
  if (order.reservationState !== "reserved") return false
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
    .take(MAX_ORDER_LINES)
  await adjustReservations(ctx, lines, [])
  await ctx.db.patch(order._id, {
    reservationState: "released",
    updatedAt: Date.now(),
  })
  return true
}

export async function appendOrderHistory(
  ctx: MutationCtx,
  args: {
    order: Doc<"orders">
    actorUserId: string
    actorRole: "guest" | "organizer" | "system"
    lifecycle?: Doc<"orders">["lifecycle"]
    paymentStatus?: Doc<"orders">["paymentStatus"]
    progress?: Doc<"orders">["progress"]
    note?: string
  }
) {
  await ctx.db.insert("orderStatusHistory", {
    orderId: args.order._id,
    eventId: args.order.eventId,
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    previousLifecycle: args.order.lifecycle,
    lifecycle: args.lifecycle ?? args.order.lifecycle,
    previousPaymentStatus: args.order.paymentStatus,
    paymentStatus: args.paymentStatus ?? args.order.paymentStatus,
    previousProgress: args.order.progress,
    progress: args.progress ?? args.order.progress,
    note: safeText(args.note, "History note", 500),
    createdAt: Date.now(),
  })
}

export async function digestPayload(value: unknown) {
  const json = JSON.stringify(value)
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json)
  )
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export function validateRequestId(requestId: string) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
    throw new ConvexError("The request ID is invalid.")
  }
}
