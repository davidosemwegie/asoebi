/// <reference types="vite/client" />

import betterAuthTest from "@convex-dev/better-auth/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, components } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const futureDeadline = Date.now() + 30 * 24 * 60 * 60 * 1_000

type TestHarness = ReturnType<typeof createTest>
type TestClient = ReturnType<TestHarness["withIdentity"]>

const validEvent = {
  name: "Ada and Tunde",
  description: "Wedding celebration",
  eventDate: "2027-12-12",
  orderDeadline: "2027-11-30",
  orderDeadlineAt: futureDeadline,
  timeZone: "Africa/Lagos",
  location: "Lagos",
  contact: "organizer@example.com",
  currency: "NGN",
}

const validItem = {
  name: "Emerald lace",
  description: "Intricate lace in the event colour.",
  unitLabel: "5-yard bundle",
  priceMinor: 85_000_00,
  inventoryTotal: 24,
}

const pickupOption = {
  name: "Family pickup",
  type: "pickup" as const,
  feeMinor: 0,
  instructions: "Collect from the family home after confirmation.",
  enabled: true,
  requiredFields: { kind: "pickup" as const, pickupContact: true },
}

const validJpegBytes = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9,
])
const validPngBytes = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])
const validWebpBytes = (() => {
  const bytes = new Uint8Array(30)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)
  bytes.set([0x56, 0x50, 0x38, 0x58], 12)
  new DataView(bytes.buffer).setUint32(16, bytes.length - 20, true)
  return bytes
})()

function createTest() {
  const t = convexTest(schema, modules)
  betterAuthTest.register(t)
  return t
}

async function createUser(
  t: TestHarness,
  email: string,
  emailVerified = true
): Promise<{ client: TestClient; userId: string }> {
  const now = Date.now()
  const user = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: "Event owner",
        email,
        emailVerified,
        createdAt: now,
        updatedAt: now,
      },
    },
  })
  const session = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "session",
      data: {
        userId: user._id,
        token: `token-${email}`,
        expiresAt: now + 3_600_000,
        createdAt: now,
        updatedAt: now,
      },
    },
  })
  return {
    client: t.withIdentity({ subject: user._id, sessionId: session._id }),
    userId: user._id,
  }
}

async function createEvent(client: TestClient) {
  return await client.mutation(api.events.create, validEvent)
}

async function makeReady(client: TestClient, eventId: Id<"events">) {
  await client.mutation(api.items.create, { eventId, ...validItem })
  await client.mutation(api.eventSetup.savePaymentInstructions, {
    eventId,
    instructions: "Transfer the full total to the account shown here.",
  })
  await client.mutation(api.eventSetup.createFulfillmentOption, {
    eventId,
    ...pickupOption,
  })
}

async function storeTestFile(
  t: TestHarness,
  contents: BlobPart,
  contentType: string
) {
  const storageId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob([contents], { type: contentType }))
  )
  // convex-test does not currently persist Blob.type into the _storage row.
  await t.run(async (ctx) => {
    await ctx.db.patch(
      storageId as unknown as Id<"events">,
      {
        contentType,
      } as never
    )
  })
  return storageId
}

async function coverClaimInput(contents: BlobPart, contentType: string) {
  const blob = new Blob([contents], { type: contentType })
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
  return {
    contentType,
    size: blob.size,
    sha256: btoa(String.fromCharCode(...new Uint8Array(digest))),
  }
}

describe("event foundation", () => {
  it("generates unique 24-byte URL-safe tokens server-side and uses indexed lookup", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const firstId = await createEvent(client)
    const secondId = await createEvent(client)
    const first = await client.query(api.events.get, {
      eventId: firstId,
      now: Date.now(),
    })
    const second = await client.query(api.events.get, {
      eventId: secondId,
      now: Date.now(),
    })

    expect(first?.shareToken).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(second?.shareToken).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(first?.shareToken).not.toBe(second?.shareToken)
    await expect(
      client.mutation(api.events.create, {
        ...validEvent,
        shareToken: "caller-controlled-token",
      } as never)
    ).rejects.toThrow()
    await expect(
      client.query(api.sharedEvents.getLanding, {
        shareToken: first!.shareToken!,
        now: Date.now(),
      })
    ).resolves.toBeNull()

    await makeReady(client, firstId)
    await client.mutation(api.events.publish, { eventId: firstId })
    await expect(
      client.query(api.sharedEvents.getLanding, {
        shareToken: first!.shareToken!,
        now: Date.now(),
      })
    ).resolves.toMatchObject({ name: validEvent.name })
  })

  it("keeps legacy date-only rows readable and explicitly publish-ineligible", async () => {
    const t = createTest()
    const { client, userId } = await createUser(t, "legacy@example.com")
    const eventId = await t.run(async (ctx) =>
      ctx.db.insert("events", {
        ownerId: userId,
        name: "Legacy event",
        description: "Created before exact deadlines.",
        eventDate: "2026-12-12",
        orderDeadline: "2026-11-30",
        location: "Lagos",
        contact: "legacy@example.com",
        currency: "NGN",
        status: "draft",
        updatedAt: Date.now(),
      })
    )

    const event = await client.query(api.events.get, {
      eventId,
      now: Date.now(),
    })
    expect(event).toMatchObject({
      name: "Legacy event",
      orderDeadline: "2026-11-30",
    })
    expect(event).not.toHaveProperty("orderDeadlineAt")
    expect(event).not.toHaveProperty("timeZone")
    expect(event).not.toHaveProperty("shareToken")
    expect(
      event?.publishReadiness.missingRequirements.map((item) => item.code)
    ).toEqual(
      expect.arrayContaining([
        "share_token_missing",
        "time_zone_missing",
        "deadline_missing",
      ])
    )

    const token = await client.mutation(api.events.ensureShareToken, {
      eventId,
    })
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    await client.mutation(api.events.update, { eventId, ...validEvent })
    await expect(
      client.query(api.events.get, { eventId, now: Date.now() })
    ).resolves.toMatchObject({
      shareToken: token,
      orderDeadlineAt: futureDeadline,
      timeZone: "Africa/Lagos",
    })
  })

  it("reports every missing publish requirement and succeeds only when all are met", async () => {
    const t = createTest()
    const { client } = await createUser(t, "unverified@example.com", false)
    const eventId = await createEvent(client)
    let event = await client.query(api.events.get, {
      eventId,
      now: Date.now(),
    })
    expect(
      event?.publishReadiness.missingRequirements.map((item) => item.code)
    ).toEqual([
      "owner_email_unverified",
      "available_item_missing",
      "payment_instructions_missing",
      "fulfillment_option_missing",
    ])
    await expect(
      client.mutation(api.events.publish, { eventId })
    ).rejects.toThrow("Verify the organizer email address")

    await t.mutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "email", value: "unverified@example.com" }],
        update: { emailVerified: true, updatedAt: Date.now() },
      },
    })
    const itemId = await client.mutation(api.items.create, {
      eventId,
      ...validItem,
      inventoryTotal: 0,
    })
    await client.mutation(api.items.setHidden, { itemId, isHidden: true })
    await client.mutation(api.eventSetup.savePaymentInstructions, {
      eventId,
      instructions: "Pay by bank transfer.",
    })
    const optionId = await client.mutation(
      api.eventSetup.createFulfillmentOption,
      { eventId, ...pickupOption, enabled: false }
    )
    event = await client.query(api.events.get, { eventId, now: Date.now() })
    expect(
      event?.publishReadiness.missingRequirements.map((item) => item.code)
    ).toEqual(["available_item_missing", "fulfillment_option_missing"])

    await client.mutation(api.items.update, {
      itemId,
      ...validItem,
      inventoryTotal: 1,
    })
    await client.mutation(api.items.setHidden, { itemId, isHidden: false })
    await client.mutation(api.eventSetup.setFulfillmentOptionEnabled, {
      optionId,
      enabled: true,
    })
    event = await client.query(api.events.get, { eventId, now: Date.now() })
    expect(event?.publishReadiness).toEqual({
      isReady: true,
      missingRequirements: [],
    })
    await expect(
      client.mutation(api.events.publish, { eventId })
    ).resolves.toBeNull()
  })

  it("validates exact deadlines and IANA time zones", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await expect(
      client.query(api.events.get, { eventId } as never)
    ).rejects.toThrow()
    await expect(
      client.query(api.events.get, { eventId, now: -1 })
    ).rejects.toThrow("valid current time")
    await expect(
      client.mutation(api.events.create, {
        ...validEvent,
        timeZone: "Not/A_Zone",
      })
    ).rejects.toThrow("valid IANA")
    await expect(
      client.mutation(api.events.create, {
        ...validEvent,
        orderDeadlineAt: 1.5,
      })
    ).rejects.toThrow("valid exact")
    await expect(
      client.mutation(api.events.create, {
        ...validEvent,
        timeZone: undefined,
      })
    ).rejects.toThrow("both an exact")

    const pastDeadlineEventId = await client.mutation(api.events.create, {
      ...validEvent,
      orderDeadlineAt: Date.now() - 1,
    })
    await makeReady(client, pastDeadlineEventId)
    const event = await client.query(api.events.get, {
      eventId: pastDeadlineEventId,
      now: Date.now(),
    })
    expect(event?.publishReadiness.missingRequirements).toContainEqual(
      expect.objectContaining({ code: "deadline_not_future" })
    )
  })

  it("enforces owner-only lifecycle transitions and reopen readiness", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: stranger } = await createUser(t, "stranger@example.com")
    const eventId = await createEvent(owner)
    await makeReady(owner, eventId)

    await expect(
      stranger.mutation(api.events.publish, { eventId })
    ).rejects.toThrow("Event not found")
    await expect(owner.mutation(api.events.close, { eventId })).rejects.toThrow(
      "published event"
    )
    await owner.mutation(api.events.publish, { eventId })
    await owner.mutation(api.events.publish, { eventId })
    await owner.mutation(api.events.close, { eventId })
    await owner.mutation(api.events.close, { eventId })
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { orderDeadlineAt: Date.now() - 1 })
    })
    await expect(
      owner.mutation(api.events.reopen, { eventId })
    ).rejects.toThrow("future time")
    await t.run(async (ctx) => {
      await ctx.db.patch(eventId, { orderDeadlineAt: futureDeadline })
    })
    await owner.mutation(api.events.reopen, { eventId })
    await owner.mutation(api.events.archive, { eventId })
    await owner.mutation(api.events.archive, { eventId })
    await expect(
      owner.mutation(api.events.update, {
        eventId,
        ...validEvent,
        name: "Disallowed",
      })
    ).rejects.toThrow("read-only")
  })

  it("lists draft, published, and closed events but excludes archived events", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const draftId = await createEvent(client)
    const publishedId = await createEvent(client)
    const closedId = await createEvent(client)
    const archivedId = await createEvent(client)

    for (const eventId of [publishedId, closedId, archivedId]) {
      await makeReady(client, eventId)
      await client.mutation(api.events.publish, { eventId })
    }
    await client.mutation(api.events.close, { eventId: closedId })
    await client.mutation(api.events.archive, { eventId: archivedId })

    const events = await client.query(api.events.listMine, {})
    expect(events.map((event) => event._id)).toEqual(
      expect.arrayContaining([draftId, publishedId, closedId])
    )
    expect(events.map((event) => event._id)).not.toContain(archivedId)
    expect(events.map((event) => event.status)).toEqual(
      expect.arrayContaining(["draft", "published", "closed"])
    )
    expect(events).toHaveLength(3)
  })

  it("keeps payment and fulfillment configuration event-scoped and bounded", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: stranger } = await createUser(t, "stranger@example.com")
    const eventId = await createEvent(owner)
    await owner.mutation(api.eventSetup.savePaymentInstructions, {
      eventId,
      instructions: "  Pay the full amount by bank transfer.  ",
    })
    await owner.mutation(api.eventSetup.savePaymentInstructions, {
      eventId,
      instructions: "Updated bank transfer guidance.",
    })
    const paymentRows = await t.run(async (ctx) =>
      ctx.db
        .query("eventPaymentInstructions")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect()
    )
    expect(paymentRows).toHaveLength(1)
    expect(paymentRows[0]?.instructions).toBe("Updated bank transfer guidance.")
    await expect(
      stranger.mutation(api.eventSetup.savePaymentInstructions, {
        eventId,
        instructions: "Hijacked instructions",
      })
    ).rejects.toThrow("Event not found")
    await expect(
      owner.mutation(api.eventSetup.createFulfillmentOption, {
        eventId,
        ...pickupOption,
        feeMinor: -1,
      })
    ).rejects.toThrow("flat fee")
    await expect(
      owner.mutation(api.eventSetup.createFulfillmentOption, {
        eventId,
        ...pickupOption,
        requiredFields: {
          kind: "delivery",
          recipientName: true,
          phoneNumber: true,
          address: true,
          availability: false,
          notes: false,
        },
      })
    ).rejects.toThrow("match the fulfillment type")
  })

  it("validates, replaces, removes, and tenant-isolates cover uploads", async () => {
    const t = createTest()
    const { client: owner } = await createUser(t, "owner@example.com")
    const { client: stranger } = await createUser(t, "stranger@example.com")
    const eventId = await createEvent(owner)
    const preexistingStorageId = await storeTestFile(
      t,
      "unrelated",
      "image/png"
    )
    const unrelatedClaim = await owner.mutation(
      api.eventSetup.generateCoverUploadUrl,
      { eventId, ...(await coverClaimInput("unrelated", "image/png")) }
    )
    await expect(
      owner.action(api.eventSetup.setCover, {
        eventId,
        claimId: unrelatedClaim.claimId,
        storageId: preexistingStorageId,
      })
    ).resolves.toEqual(expect.objectContaining({ ok: false }))
    await t.run(async (ctx) => {
      expect(
        await ctx.db.system.get("_storage", preexistingStorageId)
      ).not.toBeNull()
    })

    const firstClaim = await owner.mutation(
      api.eventSetup.generateCoverUploadUrl,
      { eventId, ...(await coverClaimInput(validPngBytes, "image/png")) }
    )
    const firstStorageId = await storeTestFile(t, validPngBytes, "image/png")
    const secondClaim = await owner.mutation(
      api.eventSetup.generateCoverUploadUrl,
      { eventId, ...(await coverClaimInput(validWebpBytes, "image/webp")) }
    )
    const secondStorageId = await storeTestFile(t, validWebpBytes, "image/webp")
    const invalidClaim = await owner.mutation(
      api.eventSetup.generateCoverUploadUrl,
      { eventId, ...(await coverClaimInput("not an image", "image/png")) }
    )
    const invalidStorageId = await storeTestFile(t, "not an image", "image/png")
    const truncatedPngBytes = validPngBytes.slice(0, 33)
    const truncatedClaim = await owner.mutation(
      api.eventSetup.generateCoverUploadUrl,
      {
        eventId,
        ...(await coverClaimInput(truncatedPngBytes, "image/png")),
      }
    )
    const truncatedStorageId = await storeTestFile(
      t,
      truncatedPngBytes,
      "image/png"
    )
    await expect(
      owner.mutation(api.eventSetup.generateCoverUploadUrl, {
        eventId,
        contentType: "image/png",
        size: 10 * 1024 * 1024 + 1,
        sha256: `${"A".repeat(43)}=`,
      })
    ).rejects.toThrow("no larger than 10 MB")

    await expect(
      stranger.action(api.eventSetup.setCover, {
        eventId,
        claimId: firstClaim.claimId,
        storageId: firstStorageId,
      })
    ).rejects.toThrow("Event not found")
    await expect(
      owner.action(api.eventSetup.setCover, {
        eventId,
        claimId: invalidClaim.claimId,
        storageId: invalidStorageId,
      })
    ).resolves.toEqual({
      ok: false,
      message:
        "The uploaded file does not contain a valid JPEG, PNG, or WebP image.",
    })
    await t.run(async (ctx) => {
      expect((await ctx.db.get(eventId))?.coverStorageId).toBeUndefined()
    })
    await expect(
      owner.action(api.eventSetup.setCover, {
        eventId,
        claimId: truncatedClaim.claimId,
        storageId: truncatedStorageId,
      })
    ).resolves.toEqual(expect.objectContaining({ ok: false }))
    await expect(
      owner.action(api.eventSetup.setCover, {
        eventId,
        claimId: firstClaim.claimId,
        storageId: firstStorageId,
      })
    ).resolves.toEqual({ ok: true })
    await expect(
      owner.action(api.eventSetup.setCover, {
        eventId,
        claimId: secondClaim.claimId,
        storageId: secondStorageId,
      })
    ).resolves.toEqual({ ok: true })
    await t.run(async (ctx) => {
      expect(await ctx.db.system.get("_storage", firstStorageId)).toBeNull()
      expect(
        await ctx.db.system.get("_storage", invalidStorageId)
      ).not.toBeNull()
      expect(
        await ctx.db.system.get("_storage", secondStorageId)
      ).not.toBeNull()
    })
    const jpegClaim = await owner.mutation(
      api.eventSetup.generateCoverUploadUrl,
      { eventId, ...(await coverClaimInput(validJpegBytes, "image/jpeg")) }
    )
    const jpegStorageId = await storeTestFile(t, validJpegBytes, "image/jpeg")
    await expect(
      owner.action(api.eventSetup.setCover, {
        eventId,
        claimId: jpegClaim.claimId,
        storageId: jpegStorageId,
      })
    ).resolves.toEqual({ ok: true })
    await t.run(async (ctx) => {
      expect(await ctx.db.system.get("_storage", secondStorageId)).toBeNull()
      expect(await ctx.db.system.get("_storage", jpegStorageId)).not.toBeNull()
    })
    await owner.mutation(api.eventSetup.removeCover, { eventId })
    await t.run(async (ctx) => {
      expect(await ctx.db.system.get("_storage", jpegStorageId)).toBeNull()
    })
  })

  it("draft deletion also removes event setup records and uploaded cover", async () => {
    const t = createTest()
    const { client } = await createUser(t, "owner@example.com")
    const eventId = await createEvent(client)
    await makeReady(client, eventId)
    const claim = await client.mutation(api.eventSetup.generateCoverUploadUrl, {
      eventId,
      ...(await coverClaimInput(validJpegBytes, "image/jpeg")),
    })
    const storageId = await storeTestFile(t, validJpegBytes, "image/jpeg")
    await expect(
      client.action(api.eventSetup.setCover, {
        eventId,
        claimId: claim.claimId,
        storageId,
      })
    ).resolves.toEqual({ ok: true })
    await client.mutation(api.events.remove, { eventId })
    await t.run(async (ctx) => {
      expect(await ctx.db.get(eventId)).toBeNull()
      expect(await ctx.db.system.get("_storage", storageId)).toBeNull()
      expect(
        await ctx.db
          .query("eventPaymentInstructions")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .unique()
      ).toBeNull()
      expect(
        await ctx.db
          .query("fulfillmentOptions")
          .withIndex("by_eventId_and_sortOrder", (q) =>
            q.eq("eventId", eventId)
          )
          .collect()
      ).toEqual([])
    })
  })
})
