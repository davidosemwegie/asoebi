import { ConvexError, v } from "convex/values"
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"

import { authComponent } from "./auth"
import {
  MAX_EVENT_INVITATIONS,
  MAX_EVENT_INVITATION_IMPORT_RECEIPTS,
  MAX_EVENT_INVITATION_SEND_RECEIPTS,
  requireEditableEvent,
  requireOwnedEvent,
} from "./eventModel"
import {
  invitationActivityCounts,
  invitationDeliveryCounts,
} from "./eventInvitationAggregates"
import { createNotification } from "./notifications"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  mutation,
  query,
  env,
  type MutationCtx,
} from "./_generated/server"

const MAX_IMPORT_ROWS = 1_000
const MAX_CHUNK_ROWS = 100
const MAX_SELECTED_INVITATIONS = 100
const RECEIPT_TTL = 24 * 60 * 60 * 1_000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IMPORT_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/

const deliveryState = v.union(
  v.literal("not_sent"),
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delayed"),
  v.literal("failed"),
  v.literal("suppressed")
)
const activity = v.union(
  v.literal("not_started"),
  v.literal("checkout_started"),
  v.literal("order_submitted"),
  v.literal("order_completed")
)
const source = v.union(
  v.literal("manual"),
  v.literal("csv"),
  v.literal("paste")
)

const invitationResult = v.object({
  _id: v.id("eventInvitations"),
  name: v.string(),
  email: v.string(),
  source,
  latestDeliveryState: deliveryState,
  activity,
  latestSentAt: v.optional(v.number()),
  currentNotificationId: v.optional(v.id("notifications")),
  matchedUserId: v.optional(v.string()),
  attendeeId: v.optional(v.id("eventAttendees")),
  orderId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const importOutcome = v.object({
  rowNumber: v.number(),
  outcome: v.union(
    v.literal("created"),
    v.literal("duplicate"),
    v.literal("invalid")
  ),
  invitationId: v.optional(v.id("eventInvitations")),
  error: v.optional(v.string()),
})

const sendResult = v.object({
  invitationId: v.id("eventInvitations"),
  outcome: v.union(
    v.literal("queued"),
    v.literal("retried"),
    v.literal("already_sent"),
    v.literal("blocked"),
    v.literal("not_found")
  ),
})

type Invitation = Doc<"eventInvitations">

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new ConvexError("Enter a valid email address.")
  }
  return email
}

function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, " ")
  if (!name || name.length > 120) {
    throw new ConvexError("Enter a name of up to 120 characters.")
  }
  return name
}

function searchText(name: string, email: string) {
  return `${name} ${email}`.toLowerCase()
}

function invitationView(invitation: Invitation) {
  return {
    _id: invitation._id,
    name: invitation.name,
    email: invitation.email,
    source: invitation.source,
    latestDeliveryState: invitation.latestDeliveryState,
    activity: invitation.activity,
    latestSentAt: invitation.latestSentAt,
    currentNotificationId: invitation.currentNotificationId,
    matchedUserId: invitation.matchedUserId,
    attendeeId: invitation.attendeeId,
    orderId: invitation.orderId,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  }
}

async function insertInvitation(
  ctx: MutationCtx,
  invitation: Omit<Invitation, "_id" | "_creationTime">
) {
  const invitationId = await ctx.db.insert("eventInvitations", invitation)
  const created = await ctx.db.get(invitationId)
  if (!created) throw new Error("Invitation could not be created.")
  await Promise.all([
    invitationDeliveryCounts.insert(ctx, created),
    invitationActivityCounts.insert(ctx, created),
  ])
  return created
}

async function invitationCapacity(ctx: MutationCtx, eventId: Id<"events">) {
  return await invitationDeliveryCounts.count(ctx, { namespace: eventId })
}

async function requireInvitationCapacity(
  ctx: MutationCtx,
  eventId: Id<"events">
) {
  if ((await invitationCapacity(ctx, eventId)) >= MAX_EVENT_INVITATIONS)
    throw new ConvexError(
      `An event can have up to ${MAX_EVENT_INVITATIONS} guest invitations.`
    )
}

async function requireImportReceiptCapacity(
  ctx: MutationCtx,
  eventId: Id<"events">
) {
  const receipts = await ctx.db
    .query("eventInvitationImportChunks")
    .withIndex("by_eventId_and_importId_and_chunkIndex", (q) =>
      q.eq("eventId", eventId)
    )
    .take(MAX_EVENT_INVITATION_IMPORT_RECEIPTS)
  if (receipts.length >= MAX_EVENT_INVITATION_IMPORT_RECEIPTS)
    throw new ConvexError("Too many recent import receipts for this event.")
}

async function requireSendReceiptCapacity(
  ctx: MutationCtx,
  eventId: Id<"events">
) {
  const receipts = await ctx.db
    .query("eventInvitationSendRequests")
    .withIndex("by_eventId_and_requestId", (q) => q.eq("eventId", eventId))
    .take(MAX_EVENT_INVITATION_SEND_RECEIPTS)
  if (receipts.length >= MAX_EVENT_INVITATION_SEND_RECEIPTS)
    throw new ConvexError("Too many recent send requests for this event.")
}

async function replaceInvitation(
  ctx: MutationCtx,
  oldInvitation: Invitation,
  patch: Partial<Omit<Invitation, "_id" | "_creationTime" | "eventId">>
) {
  await ctx.db.patch(oldInvitation._id, patch)
  const updated = await ctx.db.get(oldInvitation._id)
  if (!updated) throw new Error("Invitation could not be updated.")
  await Promise.all([
    invitationDeliveryCounts.replace(ctx, oldInvitation, updated),
    invitationActivityCounts.replace(ctx, oldInvitation, updated),
  ])
  return updated
}

function importSummary(
  outcomes: Array<{ outcome: "created" | "duplicate" | "invalid" }>
) {
  return outcomes.reduce(
    (summary, outcome) => ({
      ...summary,
      [outcome.outcome]: summary[outcome.outcome] + 1,
    }),
    { created: 0, duplicate: 0, invalid: 0 }
  )
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  )
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

function validateImportId(importId: string) {
  if (!IMPORT_ID_PATTERN.test(importId))
    throw new ConvexError("The import receipt is invalid.")
}

function validateRequestId(requestId: string) {
  if (!REQUEST_ID_PATTERN.test(requestId))
    throw new ConvexError("The send request is invalid.")
}

export const list = query({
  args: {
    eventId: v.id("events"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    deliveryState: v.optional(deliveryState),
    activity: v.optional(activity),
  },
  returns: paginationResultValidator(invitationResult),
  handler: async (ctx, args) => {
    await requireOwnedEvent(ctx, args.eventId)
    const search = args.search?.trim().toLowerCase()
    if (search && search.length > 100)
      throw new ConvexError("Search is too long.")
    if (search) {
      const page = await ctx.db
        .query("eventInvitations")
        .withSearchIndex("search_eventId_and_text", (q) => {
          let filter = q
            .search("searchText", search)
            .eq("eventId", args.eventId)
          if (args.deliveryState)
            filter = filter.eq("latestDeliveryState", args.deliveryState)
          if (args.activity) filter = filter.eq("activity", args.activity)
          return filter
        })
        .paginate(args.paginationOpts)
      return { ...page, page: page.page.map(invitationView) }
    }
    if (args.deliveryState && args.activity) {
      const page = await ctx.db
        .query("eventInvitations")
        .withIndex(
          "by_eventId_and_latestDeliveryState_and_activity_and_createdAt",
          (q) =>
            q
              .eq("eventId", args.eventId)
              .eq("latestDeliveryState", args.deliveryState!)
              .eq("activity", args.activity!)
        )
        .order("desc")
        .paginate(args.paginationOpts)
      return { ...page, page: page.page.map(invitationView) }
    }
    if (args.deliveryState) {
      const page = await ctx.db
        .query("eventInvitations")
        .withIndex("by_eventId_and_latestDeliveryState_and_createdAt", (q) =>
          q
            .eq("eventId", args.eventId)
            .eq("latestDeliveryState", args.deliveryState!)
        )
        .order("desc")
        .paginate(args.paginationOpts)
      return { ...page, page: page.page.map(invitationView) }
    }
    if (args.activity) {
      const page = await ctx.db
        .query("eventInvitations")
        .withIndex("by_eventId_and_activity_and_createdAt", (q) =>
          q.eq("eventId", args.eventId).eq("activity", args.activity!)
        )
        .order("desc")
        .paginate(args.paginationOpts)
      return { ...page, page: page.page.map(invitationView) }
    }
    const page = await ctx.db
      .query("eventInvitations")
      .withIndex("by_eventId_and_createdAt", (q) =>
        q.eq("eventId", args.eventId)
      )
      .order("desc")
      .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(invitationView) }
  },
})

export const add = mutation({
  args: { eventId: v.id("events"), name: v.string(), email: v.string() },
  returns: invitationResult,
  handler: async (ctx, args) => {
    await requireEditableEvent(ctx, args.eventId)
    const name = normalizeName(args.name)
    const email = normalizeEmail(args.email)
    const existing = await ctx.db
      .query("eventInvitations")
      .withIndex("by_eventId_and_normalizedEmail", (q) =>
        q.eq("eventId", args.eventId).eq("normalizedEmail", email)
      )
      .unique()
    if (existing)
      throw new ConvexError("This email address is already on the guest list.")
    await requireInvitationCapacity(ctx, args.eventId)
    const now = Date.now()
    return invitationView(
      await insertInvitation(ctx, {
        eventId: args.eventId,
        name,
        email,
        normalizedEmail: email,
        searchText: searchText(name, email),
        source: "manual",
        latestDeliveryState: "not_sent",
        activity: "not_started",
        sendGeneration: 0,
        createdAt: now,
        updatedAt: now,
      })
    )
  },
})

export const importBatch = mutation({
  args: {
    eventId: v.id("events"),
    importId: v.string(),
    chunkIndex: v.number(),
    source: v.union(v.literal("csv"), v.literal("paste")),
    rows: v.array(
      v.object({ rowNumber: v.number(), name: v.string(), email: v.string() })
    ),
  },
  returns: v.object({
    summary: v.object({
      created: v.number(),
      duplicate: v.number(),
      invalid: v.number(),
    }),
    outcomes: v.array(importOutcome),
  }),
  handler: async (ctx, args) => {
    await requireEditableEvent(ctx, args.eventId)
    validateImportId(args.importId)
    if (
      !Number.isInteger(args.chunkIndex) ||
      args.chunkIndex < 0 ||
      args.chunkIndex >= MAX_IMPORT_ROWS / MAX_CHUNK_ROWS
    )
      throw new ConvexError("The import chunk is invalid.")
    if (args.rows.length === 0 || args.rows.length > MAX_CHUNK_ROWS)
      throw new ConvexError(
        "Import chunks must include between 1 and 100 rows."
      )
    if (
      args.rows.some(
        (row) =>
          !Number.isInteger(row.rowNumber) ||
          row.rowNumber < (args.source === "csv" ? 2 : 1)
      )
    )
      throw new ConvexError("Import row numbers are invalid.")
    const payloadHash = await digest(
      JSON.stringify({ source: args.source, rows: args.rows })
    )
    const replay = await ctx.db
      .query("eventInvitationImportChunks")
      .withIndex("by_eventId_and_importId_and_chunkIndex", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("importId", args.importId)
          .eq("chunkIndex", args.chunkIndex)
      )
      .unique()
    if (replay) {
      if (replay.payloadHash !== payloadHash)
        throw new ConvexError(
          "This import chunk conflicts with its original submission."
        )
      return {
        summary: importSummary(replay.outcomes),
        outcomes: replay.outcomes,
      }
    }
    if (
      new Set(args.rows.map((row) => row.rowNumber)).size !== args.rows.length
    )
      throw new ConvexError("Import row numbers must be unique.")
    await requireImportReceiptCapacity(ctx, args.eventId)
    let remainingInvitationCapacity =
      MAX_EVENT_INVITATIONS - (await invitationCapacity(ctx, args.eventId))
    const earlierChunks = await ctx.db
      .query("eventInvitationImportChunks")
      .withIndex("by_eventId_and_importId_and_chunkIndex", (q) =>
        q.eq("eventId", args.eventId).eq("importId", args.importId)
      )
      .take(MAX_IMPORT_ROWS / MAX_CHUNK_ROWS)
    const earlierRowNumbers = new Set(
      earlierChunks.flatMap((chunk) =>
        chunk.outcomes.map((outcome) => outcome.rowNumber)
      )
    )
    if (args.rows.some((row) => earlierRowNumbers.has(row.rowNumber)))
      throw new ConvexError(
        "Import row numbers overlap an earlier import chunk."
      )
    const outcomes: Array<{
      rowNumber: number
      outcome: "created" | "duplicate" | "invalid"
      invitationId?: Id<"eventInvitations">
      error?: string
    }> = []
    for (const row of args.rows) {
      let name: string
      let email: string
      try {
        name = normalizeName(row.name)
        email = normalizeEmail(row.email)
      } catch (error) {
        outcomes.push({
          rowNumber: row.rowNumber,
          outcome: "invalid",
          error:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "This row is invalid.",
        })
        continue
      }
      const existing = await ctx.db
        .query("eventInvitations")
        .withIndex("by_eventId_and_normalizedEmail", (q) =>
          q.eq("eventId", args.eventId).eq("normalizedEmail", email)
        )
        .unique()
      if (existing) {
        outcomes.push({
          rowNumber: row.rowNumber,
          outcome: "duplicate",
          error: "This email address is already on the guest list.",
        })
        continue
      }
      if (remainingInvitationCapacity <= 0) {
        outcomes.push({
          rowNumber: row.rowNumber,
          outcome: "invalid",
          error: `This event can have up to ${MAX_EVENT_INVITATIONS} guest invitations.`,
        })
        continue
      }
      const now = Date.now()
      const invitation = await insertInvitation(ctx, {
        eventId: args.eventId,
        name,
        email,
        normalizedEmail: email,
        searchText: searchText(name, email),
        source: args.source,
        latestDeliveryState: "not_sent",
        activity: "not_started",
        sendGeneration: 0,
        createdAt: now,
        updatedAt: now,
      })
      outcomes.push({
        rowNumber: row.rowNumber,
        outcome: "created",
        invitationId: invitation._id,
      })
      remainingInvitationCapacity -= 1
    }
    const now = Date.now()
    await ctx.db.insert("eventInvitationImportChunks", {
      eventId: args.eventId,
      importId: args.importId,
      chunkIndex: args.chunkIndex,
      payloadHash,
      outcomes,
      createdAt: now,
      expiresAt: now + RECEIPT_TTL,
    })
    return { summary: importSummary(outcomes), outcomes }
  },
})

export const update = mutation({
  args: {
    invitationId: v.id("eventInvitations"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: invitationResult,
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId)
    if (!invitation) throw new ConvexError("Invitation not found.")
    await requireEditableEvent(ctx, invitation.eventId)
    const name =
      args.name === undefined ? invitation.name : normalizeName(args.name)
    const email =
      args.email === undefined ? invitation.email : normalizeEmail(args.email)
    if (email !== invitation.normalizedEmail) {
      const duplicate = await ctx.db
        .query("eventInvitations")
        .withIndex("by_eventId_and_normalizedEmail", (q) =>
          q.eq("eventId", invitation.eventId).eq("normalizedEmail", email)
        )
        .unique()
      if (duplicate && duplicate._id !== invitation._id)
        throw new ConvexError(
          "This email address is already on the guest list."
        )
    }
    const correctedEmail = email !== invitation.normalizedEmail
    const updated = await replaceInvitation(ctx, invitation, {
      name,
      email,
      normalizedEmail: email,
      searchText: searchText(name, email),
      ...(correctedEmail
        ? {
            latestDeliveryState: "not_sent",
            currentNotificationId: undefined,
            latestSentAt: undefined,
            matchedUserId: undefined,
            attendeeId: undefined,
            orderId: undefined,
            activity: "not_started",
          }
        : {}),
      updatedAt: Date.now(),
    })
    return invitationView(updated)
  },
})

async function findSendReplay(
  ctx: MutationCtx,
  eventId: Id<"events">,
  requestId: string,
  kind: "send" | "retry",
  invitationIds: Id<"eventInvitations">[],
  resend = false
) {
  const existing = await ctx.db
    .query("eventInvitationSendRequests")
    .withIndex("by_eventId_and_requestId", (q) =>
      q.eq("eventId", eventId).eq("requestId", requestId)
    )
    .unique()
  if (!existing) return null
  if (
    existing.kind !== kind ||
    existing.resend !== resend ||
    existing.invitationIds.length !== invitationIds.length ||
    existing.invitationIds.some((id, index) => id !== invitationIds[index])
  )
    throw new ConvexError(
      "This send request conflicts with its original submission."
    )
  return existing.results
}

async function saveSendReceipt(
  ctx: MutationCtx,
  eventId: Id<"events">,
  requestId: string,
  kind: "send" | "retry",
  invitationIds: Id<"eventInvitations">[],
  resend: boolean,
  results: Array<{
    invitationId: Id<"eventInvitations">
    outcome: "queued" | "retried" | "already_sent" | "blocked" | "not_found"
  }>
) {
  const now = Date.now()
  await ctx.db.insert("eventInvitationSendRequests", {
    eventId,
    requestId,
    kind,
    resend,
    invitationIds,
    results,
    createdAt: now,
    expiresAt: now + RECEIPT_TTL,
  })
}

function uniqueSelection(invitationIds: Id<"eventInvitations">[]) {
  if (
    invitationIds.length === 0 ||
    invitationIds.length > MAX_SELECTED_INVITATIONS
  )
    throw new ConvexError("Select between 1 and 100 guests.")
  if (new Set(invitationIds).size !== invitationIds.length)
    throw new ConvexError("Select each guest only once.")
}

function requireInvitationDeliveryOpen(event: Doc<"events">) {
  if (event.status !== "published" || !event.shareToken)
    throw new ConvexError("Publish the event before sending invitations.")
  if (
    event.orderDeadlineAt === undefined ||
    event.orderDeadlineAt <= Date.now()
  )
    throw new ConvexError("The ordering deadline has passed.")
}

export const send = mutation({
  args: {
    eventId: v.id("events"),
    invitationIds: v.array(v.id("eventInvitations")),
    requestId: v.string(),
    resend: v.optional(v.boolean()),
  },
  returns: v.array(sendResult),
  handler: async (ctx, args) => {
    const event = await requireEditableEvent(ctx, args.eventId)
    validateRequestId(args.requestId)
    uniqueSelection(args.invitationIds)
    const replay = await findSendReplay(
      ctx,
      args.eventId,
      args.requestId,
      "send",
      args.invitationIds,
      args.resend === true
    )
    if (replay) return replay
    requireInvitationDeliveryOpen(event)
    await requireSendReceiptCapacity(ctx, args.eventId)
    const owner = await authComponent.getAuthUser(ctx)
    const results: Array<{
      invitationId: Id<"eventInvitations">
      outcome: "queued" | "retried" | "already_sent" | "blocked" | "not_found"
    }> = []
    for (const invitationId of args.invitationIds) {
      const invitation = await ctx.db.get(invitationId)
      if (!invitation || invitation.eventId !== args.eventId) {
        results.push({ invitationId, outcome: "not_found" })
        continue
      }
      if (invitation.latestDeliveryState === "suppressed") {
        results.push({ invitationId, outcome: "blocked" })
        continue
      }
      const eligible = args.resend
        ? ["sent", "delivered"].includes(invitation.latestDeliveryState)
        : invitation.latestDeliveryState === "not_sent"
      if (!eligible) {
        results.push({ invitationId, outcome: "already_sent" })
        continue
      }
      const generation = invitation.sendGeneration + 1
      const notificationId = await createNotification(ctx, {
        dedupeKey: `event-invitation:${invitation._id}:${generation}`,
        recipient: invitation.email,
        ownerId: owner._id,
        eventRef: `${event._id}`,
        invitationRef: `${invitation._id}`,
        template: {
          kind: "event_invitation",
          recipientName: invitation.name,
          eventName: event.name,
          organizerName: owner.name,
          actionUrl: `${env.SITE_URL}/e/${event.shareToken}`,
        },
      })
      const notification = await ctx.db.get(notificationId)
      const latestDeliveryState = mapNotificationState(
        notification?.status ?? "failed"
      )
      await replaceInvitation(ctx, invitation, {
        currentNotificationId: notificationId,
        sendGeneration: generation,
        latestDeliveryState,
        latestSentAt: Date.now(),
        updatedAt: Date.now(),
      })
      results.push({
        invitationId,
        outcome: latestDeliveryState === "suppressed" ? "blocked" : "queued",
      })
    }
    await saveSendReceipt(
      ctx,
      args.eventId,
      args.requestId,
      "send",
      args.invitationIds,
      args.resend === true,
      results
    )
    return results
  },
})

export const retry = mutation({
  args: {
    eventId: v.id("events"),
    invitationIds: v.array(v.id("eventInvitations")),
    requestId: v.string(),
  },
  returns: v.array(sendResult),
  handler: async (ctx, args) => {
    const event = await requireEditableEvent(ctx, args.eventId)
    validateRequestId(args.requestId)
    uniqueSelection(args.invitationIds)
    const replay = await findSendReplay(
      ctx,
      args.eventId,
      args.requestId,
      "retry",
      args.invitationIds
    )
    if (replay) return replay
    requireInvitationDeliveryOpen(event)
    await requireSendReceiptCapacity(ctx, args.eventId)
    const results: Array<{
      invitationId: Id<"eventInvitations">
      outcome: "queued" | "retried" | "already_sent" | "blocked" | "not_found"
    }> = []
    for (const invitationId of args.invitationIds) {
      const invitation = await ctx.db.get(invitationId)
      if (
        !invitation ||
        invitation.eventId !== args.eventId ||
        !invitation.currentNotificationId
      ) {
        results.push({ invitationId, outcome: "not_found" })
        continue
      }
      if (invitation.latestDeliveryState === "suppressed") {
        results.push({ invitationId, outcome: "blocked" })
        continue
      }
      if (!["failed", "delayed"].includes(invitation.latestDeliveryState)) {
        results.push({ invitationId, outcome: "already_sent" })
        continue
      }
      await ctx.runMutation(internal.notifications.retryInternal, {
        notificationId: invitation.currentNotificationId,
      })
      results.push({ invitationId, outcome: "retried" })
    }
    await saveSendReceipt(
      ctx,
      args.eventId,
      args.requestId,
      "retry",
      args.invitationIds,
      false,
      results
    )
    return results
  },
})

function mapNotificationState(
  status: string
): "queued" | "sent" | "delivered" | "delayed" | "failed" | "suppressed" {
  switch (status) {
    case "scheduled":
    case "queued":
      return "queued"
    case "sent":
      return "sent"
    case "delivered":
      return "delivered"
    case "delayed":
      return "delayed"
    case "bounced":
    case "complained":
    case "suppressed":
      return "suppressed"
    default:
      return "failed"
  }
}

export const projectNotificationDelivery = internalMutation({
  args: { notificationId: v.id("notifications"), status: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentInvitation = await ctx.db
      .query("eventInvitations")
      .withIndex("by_currentNotificationId", (q) =>
        q.eq("currentNotificationId", args.notificationId)
      )
      .unique()
    const latestDeliveryState = mapNotificationState(args.status)
    if (currentInvitation) {
      if (currentInvitation.latestDeliveryState !== latestDeliveryState)
        await replaceInvitation(ctx, currentInvitation, {
          latestDeliveryState,
          updatedAt: Date.now(),
        })
      return null
    }
    if (latestDeliveryState !== "suppressed") return null

    const notification = await ctx.db.get(args.notificationId)
    if (!notification?.invitationRef || !notification.eventRef) return null
    const invitation = await ctx.db.get(
      notification.invitationRef as Id<"eventInvitations">
    )
    if (
      !invitation ||
      `${invitation._id}` !== notification.invitationRef ||
      `${invitation.eventId}` !== notification.eventRef ||
      invitation.normalizedEmail !== notification.recipient
    )
      return null
    if (invitation.latestDeliveryState !== "suppressed")
      await replaceInvitation(ctx, invitation, {
        latestDeliveryState,
        updatedAt: Date.now(),
      })
    return null
  },
})

export const matchCheckoutStarted = internalMutation({
  args: {
    eventId: v.id("events"),
    attendeeId: v.id("eventAttendees"),
    userId: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.emailVerified) return null
    const normalizedEmail = normalizeEmail(args.email)
    const invitation = await ctx.db
      .query("eventInvitations")
      .withIndex("by_eventId_and_normalizedEmail", (q) =>
        q.eq("eventId", args.eventId).eq("normalizedEmail", normalizedEmail)
      )
      .unique()
    if (!invitation) return null
    await replaceInvitation(ctx, invitation, {
      matchedUserId: args.userId,
      attendeeId: args.attendeeId,
      activity:
        invitation.activity === "not_started"
          ? "checkout_started"
          : invitation.activity,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const cleanExpiredReceipts = internalMutation({
  args: {},
  returns: v.object({ importChunks: v.number(), sendRequests: v.number() }),
  handler: async (ctx) => {
    const now = Date.now()
    const [importChunks, sendRequests] = await Promise.all([
      ctx.db
        .query("eventInvitationImportChunks")
        .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
        .take(100),
      ctx.db
        .query("eventInvitationSendRequests")
        .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
        .take(100),
    ])
    await Promise.all([
      ...importChunks.map((row) => ctx.db.delete(row._id)),
      ...sendRequests.map((row) => ctx.db.delete(row._id)),
    ])
    if (
      importChunks.length === MAX_CHUNK_ROWS ||
      sendRequests.length === MAX_CHUNK_ROWS
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.eventInvitations.cleanExpiredReceipts,
        {}
      )
    }
    return {
      importChunks: importChunks.length,
      sendRequests: sendRequests.length,
    }
  },
})
