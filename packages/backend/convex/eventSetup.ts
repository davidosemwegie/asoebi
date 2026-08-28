import { ConvexError, v } from "convex/values"

import {
  MAX_COVER_BYTES,
  MAX_FULFILLMENT_OPTIONS,
  MAX_PAYMENT_INSTRUCTIONS_LENGTH,
  SUPPORTED_COVER_TYPES,
  type EventContext,
  getOwnerId,
  requireEditableEvent,
} from "./eventModel"
import { fulfillmentRequiredFields, fulfillmentType } from "./schema"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server"

const MAX_OPTION_NAME_LENGTH = 80
const MAX_OPTION_INSTRUCTIONS_LENGTH = 1_000
const MAX_FEE_MINOR = 999_999_999_999
const COVER_UPLOAD_CLAIM_TTL_MS = 15 * 60 * 1_000
const MAX_ACTIVE_COVER_UPLOAD_CLAIMS = 5
const COVER_HEADER_BYTES = 33

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
    const referenced = await ctx.db
      .query("orders")
      .withIndex("by_eventId_and_fulfillmentOptionId_and_updatedAt", (q) =>
        q.eq("eventId", option.eventId).eq("fulfillmentOptionId", optionId)
      )
      .take(1)
    if (referenced.some((order) => order.lifecycle !== "cancelled"))
      throw new ConvexError(
        "This pickup or delivery option is used by an active order and cannot be deleted."
      )
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

const coverArgs = {
  eventId: v.id("events"),
  claimId: v.id("coverUploadClaims"),
  storageId: v.id("_storage"),
}

type CoverArgs = {
  eventId: Id<"events">
  claimId: Id<"coverUploadClaims">
  storageId: Id<"_storage">
}

type CoverResult =
  | { ok: true }
  | {
      ok: false
      message: string
    }

const coverInspectionResult = v.union(
  v.object({ ok: v.literal(true), contentType: v.string() }),
  v.object({ ok: v.literal(false), message: v.string() })
)

type CoverInspectionResult =
  | { ok: true; contentType: string }
  | { ok: false; message: string }

function matchesBytes(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[]
) {
  return expected.every((value, index) => bytes[offset + index] === value)
}

async function hasValidCoverSignature(storedFile: Blob, contentType: string) {
  const bytes = new Uint8Array(
    await storedFile.slice(0, COVER_HEADER_BYTES).arrayBuffer()
  )

  if (contentType === "image/jpeg") {
    const ending = new Uint8Array(await storedFile.slice(-2).arrayBuffer())
    return (
      storedFile.size >= 6 &&
      matchesBytes(bytes, 0, [0xff, 0xd8, 0xff]) &&
      bytes[3] !== 0x00 &&
      bytes[3] !== 0xff &&
      matchesBytes(ending, 0, [0xff, 0xd9])
    )
  }

  if (contentType === "image/png") {
    const ending = new Uint8Array(await storedFile.slice(-12).arrayBuffer())
    return (
      storedFile.size >= 45 &&
      matchesBytes(
        bytes,
        0,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      ) &&
      matchesBytes(bytes, 8, [0x00, 0x00, 0x00, 0x0d]) &&
      matchesBytes(bytes, 12, [0x49, 0x48, 0x44, 0x52]) &&
      matchesBytes(
        ending,
        0,
        [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]
      )
    )
  }

  if (contentType === "image/webp") {
    if (
      storedFile.size < 20 ||
      !matchesBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) ||
      !matchesBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50]) ||
      !["VP8 ", "VP8L", "VP8X"].includes(
        String.fromCharCode(...bytes.slice(12, 16))
      )
    ) {
      return false
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const riffSize = view.getUint32(4, true)
    const firstChunkSize = view.getUint32(16, true)
    return (
      riffSize + 8 === storedFile.size && firstChunkSize <= storedFile.size - 20
    )
  }

  return false
}

async function inspectCoverCandidate(
  ctx: EventContext,
  args: CoverArgs,
  now: number
) {
  const { eventId, claimId, storageId } = args
  const event = await requireEditableEvent(ctx, eventId)
  const ownerId = await getOwnerId(ctx)
  const claim = await ctx.db.get(claimId)
  if (
    !claim ||
    claim.eventId !== eventId ||
    claim.ownerId !== ownerId ||
    claim.expiresAt < now
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
    return {
      ok: false as const,
      message: "The uploaded cover was not found.",
    }
  }
  if (
    metadata.contentType !== claim.contentType ||
    !SUPPORTED_COVER_TYPES.has(metadata.contentType)
  ) {
    return {
      ok: false as const,
      message: "Use a JPEG, PNG, or WebP image no larger than 10 MB.",
    }
  }

  return { ok: true as const, contentType: metadata.contentType, event }
}

export const inspectCoverUpload = internalQuery({
  args: { ...coverArgs, now: v.number() },
  returns: coverInspectionResult,
  handler: async (ctx, { now, ...args }) => {
    const candidate = await inspectCoverCandidate(ctx, args, now)
    if (!candidate.ok) return candidate
    return { ok: true as const, contentType: candidate.contentType }
  },
})

export const finalizeCoverUpload = internalMutation({
  args: { ...coverArgs, signatureValid: v.boolean() },
  returns: coverResult,
  handler: async (ctx, { signatureValid, ...args }) => {
    const candidate = await inspectCoverCandidate(ctx, args, Date.now())
    if (!candidate.ok) {
      await ctx.db.delete(args.claimId)
      return candidate
    }
    if (!signatureValid) {
      await ctx.db.delete(args.claimId)
      return {
        ok: false as const,
        message:
          "The uploaded file does not contain a valid JPEG, PNG, or WebP image.",
      }
    }

    await ctx.db.patch(args.eventId, {
      coverStorageId: args.storageId,
      updatedAt: Date.now(),
    })
    await ctx.db.delete(args.claimId)
    if (
      candidate.event.coverStorageId &&
      candidate.event.coverStorageId !== args.storageId
    ) {
      await ctx.storage.delete(candidate.event.coverStorageId)
    }
    return { ok: true as const }
  },
})

export const setCover = action({
  args: coverArgs,
  returns: coverResult,
  handler: async (ctx, args): Promise<CoverResult> => {
    const inspection: CoverInspectionResult = await ctx.runQuery(
      internal.eventSetup.inspectCoverUpload,
      { ...args, now: Date.now() }
    )
    let signatureValid = false
    if (inspection.ok) {
      const storedFile = await ctx.storage.get(args.storageId)
      signatureValid =
        storedFile !== null &&
        (await hasValidCoverSignature(storedFile, inspection.contentType))
    }
    return await ctx.runMutation(internal.eventSetup.finalizeCoverUpload, {
      ...args,
      signatureValid,
    })
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
