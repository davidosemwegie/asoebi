import { ConvexError, v } from "convex/values"

import { MAX_CATALOG_ITEMS, SUPPORTED_COVER_TYPES } from "./eventModel"
import type { Doc, Id } from "./_generated/dataModel"
import { internalQuery, query, type QueryCtx } from "./_generated/server"

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/
const MAX_TIMESTAMP = 8_640_000_000_000_000

const publicItem = v.object({
  itemKey: v.id("items"),
  name: v.string(),
  description: v.optional(v.string()),
  unitLabel: v.string(),
  priceMinor: v.number(),
  availableQuantity: v.number(),
})

const landingResult = v.object({
  name: v.string(),
  description: v.string(),
  eventDate: v.string(),
  location: v.string(),
  orderDeadlineAt: v.number(),
  timeZone: v.string(),
  organizerContact: v.string(),
  currency: v.string(),
  coverVersion: v.union(v.string(), v.null()),
  orderingOpen: v.boolean(),
  items: v.array(publicItem),
})

type PublishedEvent = Omit<
  Doc<"events">,
  "status" | "orderDeadlineAt" | "timeZone"
> & {
  status: "published"
  orderDeadlineAt: number
  timeZone: string
}

async function getPublishedEvent(
  ctx: QueryCtx,
  shareToken: string
): Promise<PublishedEvent | null> {
  if (!SHARE_TOKEN_PATTERN.test(shareToken)) return null

  const event = await ctx.db
    .query("events")
    .withIndex("by_shareToken", (q) => q.eq("shareToken", shareToken))
    .unique()

  if (
    !event ||
    event.status !== "published" ||
    event.orderDeadlineAt === undefined ||
    !event.timeZone
  ) {
    return null
  }

  return {
    ...event,
    status: "published",
    orderDeadlineAt: event.orderDeadlineAt,
    timeZone: event.timeZone,
  }
}

export function deriveCoverVersion(eventUpdatedAt: number, sha256: string) {
  let firstHash = 2_166_136_261
  let secondHash = 3_332_779_497
  for (const character of `${eventUpdatedAt}:${sha256}`) {
    const code = character.charCodeAt(0)
    firstHash ^= code
    firstHash = Math.imul(firstHash, 16_777_619)
    secondHash ^= code
    secondHash = Math.imul(secondHash, 2_246_822_519)
  }
  return `${(firstHash >>> 0).toString(36).padStart(7, "0")}${(secondHash >>> 0).toString(36).padStart(7, "0")}`
}

async function getPublicCover(
  ctx: QueryCtx,
  event: PublishedEvent
): Promise<{
  storageId: Id<"_storage">
  contentType: string
  version: string
} | null> {
  if (!event.coverStorageId) return null

  const metadata = await ctx.db.system.get("_storage", event.coverStorageId)
  if (
    !metadata?.contentType ||
    !SUPPORTED_COVER_TYPES.has(metadata.contentType)
  ) {
    return null
  }

  return {
    storageId: event.coverStorageId,
    contentType: metadata.contentType,
    version: deriveCoverVersion(event.updatedAt, metadata.sha256),
  }
}

export const getLanding = query({
  args: { shareToken: v.string(), now: v.number() },
  returns: v.union(landingResult, v.null()),
  handler: async (ctx, { shareToken, now }) => {
    if (!Number.isFinite(now) || now < 0 || now > MAX_TIMESTAMP) {
      throw new ConvexError("Choose a valid current time.")
    }

    const event = await getPublishedEvent(ctx, shareToken)
    if (!event) return null

    const [items, cover] = await Promise.all([
      ctx.db
        .query("items")
        .withIndex("by_eventId_and_isHidden_and_sortOrder", (q) =>
          q.eq("eventId", event._id).eq("isHidden", false)
        )
        .order("asc")
        .take(MAX_CATALOG_ITEMS),
      getPublicCover(ctx, event),
    ])

    return {
      name: event.name,
      description: event.description,
      eventDate: event.eventDate,
      location: event.location,
      orderDeadlineAt: event.orderDeadlineAt,
      timeZone: event.timeZone,
      organizerContact: event.contact,
      currency: event.currency,
      coverVersion: cover?.version ?? null,
      orderingOpen: event.orderDeadlineAt > now,
      items: items.map((item) => ({
        itemKey: item._id,
        name: item.name,
        description: item.description,
        unitLabel: item.unitLabel,
        priceMinor: item.priceMinor,
        availableQuantity: Math.max(
          0,
          item.inventoryTotal - item.reservedQuantity
        ),
      })),
    }
  },
})

export const getCoverForProxy = internalQuery({
  args: { shareToken: v.string(), coverVersion: v.string() },
  returns: v.union(
    v.object({ storageId: v.id("_storage"), contentType: v.string() }),
    v.null()
  ),
  handler: async (ctx, { shareToken, coverVersion }) => {
    const event = await getPublishedEvent(ctx, shareToken)
    if (!event) return null
    const cover = await getPublicCover(ctx, event)
    if (!cover || cover.version !== coverVersion) return null
    return { storageId: cover.storageId, contentType: cover.contentType }
  },
})
