import { ConvexError, v } from "convex/values"

import {
  MAX_COVER_BYTES,
  MAX_FULFILLMENT_OPTIONS,
  MAX_PAYMENT_INSTRUCTIONS_LENGTH,
  SUPPORTED_COVER_TYPES,
  getOwnerId,
  requireEditableEvent,
} from "./eventModel"
import { fulfillmentRequiredFields, fulfillmentType } from "./schema"
import { mutation } from "./_generated/server"

const MAX_OPTION_NAME_LENGTH = 80
const MAX_OPTION_INSTRUCTIONS_LENGTH = 1_000
const MAX_FEE_MINOR = 999_999_999_999
const COVER_UPLOAD_CLAIM_TTL_MS = 15 * 60 * 1_000
const MAX_ACTIVE_COVER_UPLOAD_CLAIMS = 5

const pickupRequiredFields = v.object({
  kind: v.literal("pickup"),
  pickupContact: v.boolean(),
})

const deliveryRequiredFields = v.object({
  kind: v.literal("delivery"),
  recipientName: v.boolean(),
  phoneNumber: v.boolean(),
  address: v.boolean(),
  availability: v.boolean(),
  notes: v.boolean(),
})

const fulfillmentInput = {
  name: v.string(),
  type: fulfillmentType,
  feeMinor: v.number(),
  instructions: v.string(),
  enabled: v.boolean(),
  requiredFields: fulfillmentRequiredFields,
}

type FulfillmentInput = {
  name: string
  type: "pickup" | "delivery"
  feeMinor: number
  instructions: string
  enabled: boolean
  requiredFields:
    | { kind: "pickup"; pickupContact: boolean }
    | {
        kind: "delivery"
        recipientName: boolean
        phoneNumber: boolean
        address: boolean
        availability: boolean
        notes: boolean
      }
}

function normalizeFulfillmentInput(input: FulfillmentInput) {
  const name = input.name.trim()
  const instructions = input.instructions.trim()
  if (!name || name.length > MAX_OPTION_NAME_LENGTH) {
    throw new ConvexError(
      `Enter an option name with ${MAX_OPTION_NAME_LENGTH} characters or fewer.`
    )
  }
  if (!instructions || instructions.length > MAX_OPTION_INSTRUCTIONS_LENGTH) {
    throw new ConvexError(
      `Enter instructions with ${MAX_OPTION_INSTRUCTIONS_LENGTH} characters or fewer.`
    )
  }
  if (
    !Number.isSafeInteger(input.feeMinor) ||
    input.feeMinor < 0 ||
    input.feeMinor > MAX_FEE_MINOR
  ) {
    throw new ConvexError("Enter a valid non-negative flat fee.")
  }
  if (input.type !== input.requiredFields.kind) {
    throw new ConvexError(
      "Choose required guest fields that match the fulfillment type."
    )
  }

  return { ...input, name, instructions }
}

export const savePaymentInstructions = mutation({
  args: { eventId: v.id("events"), instructions: v.string() },
  returns: v.null(),
  handler: async (ctx, { eventId, instructions }) => {
    await requireEditableEvent(ctx, eventId)
    const normalized = instructions.trim()
    if (!normalized || normalized.length > MAX_PAYMENT_INSTRUCTIONS_LENGTH) {
      throw new ConvexError(
        `Enter payment instructions with ${MAX_PAYMENT_INSTRUCTIONS_LENGTH} characters or fewer.`
      )
    }

    const existing = await ctx.db
      .query("eventPaymentInstructions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        instructions: normalized,
        updatedAt: Date.now(),
      })
    } else {
      await ctx.db.insert("eventPaymentInstructions", {
        eventId,
        instructions: normalized,
        updatedAt: Date.now(),
      })
    }
    return null
  },
})

export const removePaymentInstructions = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    await requireEditableEvent(ctx, eventId)
    const existing = await ctx.db
      .query("eventPaymentInstructions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
    return null
  },
})

export const createFulfillmentOption = mutation({
  args: { eventId: v.id("events"), ...fulfillmentInput },
  returns: v.id("fulfillmentOptions"),
  handler: async (ctx, { eventId, ...input }) => {
    await requireEditableEvent(ctx, eventId)
    const values = normalizeFulfillmentInput(input)
    const existing = await ctx.db
      .query("fulfillmentOptions")
      .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
      .take(MAX_FULFILLMENT_OPTIONS)
    if (existing.length >= MAX_FULFILLMENT_OPTIONS) {
      throw new ConvexError(
        `An event can have up to ${MAX_FULFILLMENT_OPTIONS} fulfillment options.`
      )
    }
    const last = await ctx.db
      .query("fulfillmentOptions")
      .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", eventId))
      .order("desc")
      .first()

    return await ctx.db.insert("fulfillmentOptions", {
      ...values,
      eventId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      updatedAt: Date.now(),
    })
  },
})

export const updateFulfillmentOption = mutation({
  args: { optionId: v.id("fulfillmentOptions"), ...fulfillmentInput },
  returns: v.null(),
  handler: async (ctx, { optionId, ...input }) => {
    const option = await ctx.db.get(optionId)
    if (!option) throw new ConvexError("Fulfillment option not found.")
    await requireEditableEvent(ctx, option.eventId)
    const values = normalizeFulfillmentInput(input)
    await ctx.db.patch(optionId, { ...values, updatedAt: Date.now() })
    return null
  },
})

export const setFulfillmentOptionEnabled = mutation({
  args: { optionId: v.id("fulfillmentOptions"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { optionId, enabled }) => {
    const option = await ctx.db.get(optionId)
    if (!option) throw new ConvexError("Fulfillment option not found.")
    await requireEditableEvent(ctx, option.eventId)
    if (option.enabled === enabled) return null
    await ctx.db.patch(optionId, { enabled, updatedAt: Date.now() })
    return null
  },
})

export const removeFulfillmentOption = mutation({
  args: { optionId: v.id("fulfillmentOptions") },
  returns: v.null(),
  handler: async (ctx, { optionId }) => {
    const option = await ctx.db.get(optionId)
    if (!option) return null
    await requireEditableEvent(ctx, option.eventId)
    await ctx.db.delete(optionId)
    return null
  },
})

export const generateCoverUploadUrl = mutation({
  args: {
    eventId: v.id("events"),
    contentType: v.string(),
    size: v.number(),
    sha256: v.string(),
  },
  returns: v.object({
    claimId: v.id("coverUploadClaims"),
    uploadUrl: v.string(),
  }),
  handler: async (ctx, { eventId, contentType, size, sha256 }) => {
    await requireEditableEvent(ctx, eventId)
    if (!SUPPORTED_COVER_TYPES.has(contentType)) {
      throw new ConvexError("Choose a JPEG, PNG, or WebP cover image.")
    }
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_COVER_BYTES) {
      throw new ConvexError("Choose a cover image no larger than 10 MB.")
    }
    if (!/^[A-Za-z0-9+/]{43}=$/.test(sha256)) {
      throw new ConvexError("The cover image fingerprint is not valid.")
    }
    const ownerId = await getOwnerId(ctx)
    const now = Date.now()
    const claims = await ctx.db
      .query("coverUploadClaims")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(MAX_ACTIVE_COVER_UPLOAD_CLAIMS + 1)
    let activeClaims = 0
    for (const claim of claims) {
      if (claim.expiresAt <= now) {
        await ctx.db.delete(claim._id)
      } else {
        activeClaims += 1
      }
    }
    if (activeClaims >= MAX_ACTIVE_COVER_UPLOAD_CLAIMS) {
      throw new ConvexError(
        "Too many cover uploads are waiting. Finish one or try again later."
      )
    }
    const claimId = await ctx.db.insert("coverUploadClaims", {
      eventId,
      ownerId,
      contentType,
      size,
      sha256,
      expiresAt: now + COVER_UPLOAD_CLAIM_TTL_MS,
    })
    return { claimId, uploadUrl: await ctx.storage.generateUploadUrl() }
  },
})

const coverResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), message: v.string() })
)

export const setCover = mutation({
  args: {
    eventId: v.id("events"),
    claimId: v.id("coverUploadClaims"),
    storageId: v.id("_storage"),
  },
  returns: coverResult,
  handler: async (ctx, { eventId, claimId, storageId }) => {
    const event = await requireEditableEvent(ctx, eventId)
    const ownerId = await getOwnerId(ctx)
    const claim = await ctx.db.get(claimId)
    if (
      !claim ||
      claim.eventId !== eventId ||
      claim.ownerId !== ownerId ||
      claim.expiresAt < Date.now()
    ) {
      throw new ConvexError("This cover upload is not valid. Start again.")
    }
    const metadata = await ctx.db.system.get("_storage", storageId)
    if (
      !metadata ||
      metadata._creationTime <= claim._creationTime ||
      metadata._creationTime > claim.expiresAt ||
      metadata.sha256 !== claim.sha256 ||
      metadata.size !== claim.size
    ) {
      await ctx.db.delete(claimId)
      return {
        ok: false as const,
        message: "The uploaded cover was not found.",
      }
    }
    if (
      metadata.contentType !== claim.contentType ||
      !SUPPORTED_COVER_TYPES.has(metadata.contentType)
    ) {
      await ctx.db.delete(claimId)
      return {
        ok: false as const,
        message: "Use a JPEG, PNG, or WebP image no larger than 10 MB.",
      }
    }

    await ctx.db.patch(eventId, {
      coverStorageId: storageId,
      updatedAt: Date.now(),
    })
    await ctx.db.delete(claimId)
    if (event.coverStorageId && event.coverStorageId !== storageId) {
      await ctx.storage.delete(event.coverStorageId)
    }
    return { ok: true as const }
  },
})

export const removeCover = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await requireEditableEvent(ctx, eventId)
    if (!event.coverStorageId) return null
    await ctx.db.patch(eventId, {
      coverStorageId: undefined,
      updatedAt: Date.now(),
    })
    await ctx.storage.delete(event.coverStorageId)
    return null
  },
})
