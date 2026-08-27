import { ConvexError } from "convex/values"

import { authComponent } from "./auth"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

export const MAX_CATALOG_ITEMS = 100
export const MAX_FULFILLMENT_OPTIONS = 20
export const MAX_PAYMENT_INSTRUCTIONS_LENGTH = 4_000
export const MAX_COVER_BYTES = 10 * 1024 * 1024
export const SUPPORTED_COVER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

export type EventContext = MutationCtx | QueryCtx

export type ReadinessCode =
  | "owner_email_unverified"
  | "share_token_missing"
  | "time_zone_missing"
  | "deadline_missing"
  | "deadline_not_future"
  | "available_item_missing"
  | "payment_instructions_missing"
  | "fulfillment_option_missing"

export type ReadinessRequirement = {
  code: ReadinessCode
  message: string
}

export async function getOwnerUser(ctx: EventContext) {
  return await authComponent.getAuthUser(ctx)
}

export async function getOwnerId(ctx: EventContext) {
  return (await getOwnerUser(ctx))._id
}

export async function requireOwnedEvent(
  ctx: EventContext,
  eventId: Id<"events">
) {
  const event = await ctx.db.get(eventId)
  if (!event || event.ownerId !== (await getOwnerId(ctx))) {
    throw new ConvexError("Event not found.")
  }

  return event
}

export async function requireEditableEvent(
  ctx: EventContext,
  eventId: Id<"events">
) {
  const event = await requireOwnedEvent(ctx, eventId)
  if (event.status === "archived") {
    throw new ConvexError("Archived events are read-only.")
  }

  return event
}

export function isValidTimeZone(timeZone: string) {
  if (!timeZone || timeZone.length > 100) return false

  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0)
    return true
  } catch {
    return false
  }
}

export function validateDeadline(
  orderDeadlineAt: number | undefined,
  timeZone: string | undefined
) {
  if (orderDeadlineAt === undefined && timeZone === undefined) return
  if (orderDeadlineAt === undefined || timeZone === undefined) {
    throw new ConvexError(
      "Set both an exact ordering deadline and an event time zone."
    )
  }
  if (
    !Number.isSafeInteger(orderDeadlineAt) ||
    orderDeadlineAt <= 0 ||
    orderDeadlineAt > 8_640_000_000_000_000
  ) {
    throw new ConvexError("Choose a valid exact ordering deadline.")
  }
  if (!isValidTimeZone(timeZone)) {
    throw new ConvexError("Choose a valid IANA event time zone.")
  }
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

export async function generateUniqueShareToken(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    const shareToken = encodeBase64Url(bytes)
    const existing = await ctx.db
      .query("events")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", shareToken))
      .unique()
    if (!existing) return shareToken
  }

  throw new ConvexError("We couldn't create a private event link. Try again.")
}

export async function getPublishReadiness(
  ctx: EventContext,
  event: Doc<"events">,
  now: number
) {
  if (!Number.isFinite(now) || now < 0) {
    throw new ConvexError("Choose a valid current time.")
  }

  const [owner, visibleItems, paymentInstructions, fulfillmentOption] =
    await Promise.all([
      getOwnerUser(ctx),
      ctx.db
        .query("items")
        .withIndex("by_eventId_and_isHidden_and_sortOrder", (q) =>
          q.eq("eventId", event._id).eq("isHidden", false)
        )
        .take(MAX_CATALOG_ITEMS),
      ctx.db
        .query("eventPaymentInstructions")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .unique(),
      ctx.db
        .query("fulfillmentOptions")
        .withIndex("by_eventId_and_enabled_and_sortOrder", (q) =>
          q.eq("eventId", event._id).eq("enabled", true)
        )
        .first(),
    ])

  const missingRequirements: ReadinessRequirement[] = []
  if (owner.emailVerified !== true) {
    missingRequirements.push({
      code: "owner_email_unverified",
      message: "Verify the organizer email address.",
    })
  }
  if (!event.shareToken) {
    missingRequirements.push({
      code: "share_token_missing",
      message: "Create the private event link.",
    })
  }
  if (!event.timeZone || !isValidTimeZone(event.timeZone)) {
    missingRequirements.push({
      code: "time_zone_missing",
      message: "Choose a valid IANA event time zone.",
    })
  }
  if (event.orderDeadlineAt === undefined) {
    missingRequirements.push({
      code: "deadline_missing",
      message: "Set an exact ordering deadline.",
    })
  } else if (event.orderDeadlineAt <= now) {
    missingRequirements.push({
      code: "deadline_not_future",
      message: "Move the ordering deadline to a future time.",
    })
  }
  if (
    !visibleItems.some(
      (item) => item.inventoryTotal - item.reservedQuantity > 0
    )
  ) {
    missingRequirements.push({
      code: "available_item_missing",
      message: "Add at least one visible item with available inventory.",
    })
  }
  if (!paymentInstructions) {
    missingRequirements.push({
      code: "payment_instructions_missing",
      message: "Add external payment instructions.",
    })
  }
  if (!fulfillmentOption) {
    missingRequirements.push({
      code: "fulfillment_option_missing",
      message: "Enable at least one pickup or delivery option.",
    })
  }

  return {
    isReady: missingRequirements.length === 0,
    missingRequirements,
  }
}
