import { afterEach, describe, expect, it, vi } from "vitest"

import { GET } from "./route"

vi.mock("@/lib/auth-server", () => ({ getToken: vi.fn() }))
import { getToken } from "@/lib/auth-server"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.mocked(getToken).mockReset()
})

const row = {
  reference: "=formula()",
  guestName: 'Ada, "A"',
  guestEmail: "ada@example.com",
  guestPhone: "",
  item: "Lace",
  quantity: 1,
  unitPriceMinor: 1000,
  lineTotalMinor: 1000,
  orderTotalMinor: 1000,
  currency: "NGN",
  paymentStatus: "pending_review",
  progress: "pending",
  fulfillment: "Pickup",
  fulfillmentType: "pickup",
  fulfillmentInstructions: '=Bring "ID"\nwith you',
  pickupContact: "Ada, 0800",
  deliveryRecipientName: "",
  deliveryPhoneNumber: "",
  deliveryAddress: "",
  deliveryAvailability: "",
  deliveryNotes: "",
  submittedAt: 0,
  reviewedAt: "",
  fulfilledAt: "",
  timeZone: "Africa/Lagos",
}

describe("organizer CSV stream", () => {
  it("requires authentication", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
    vi.mocked(getToken).mockResolvedValue(undefined)
    expect(
      (
        await GET(new Request("http://localhost/api/events/event/orders.csv"), {
          params: Promise.resolve({ eventId: "event" }),
        })
      ).status
    ).toBe(404)
  })

  it("streams multiple owner-authorized pages with one BOM/header and safe quoted rows", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
    vi.mocked(getToken).mockResolvedValue("owner-token")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          rows: [{ ...row, progress: "cancelled" }],
          continueCursor: "next",
          isDone: false,
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          rows: [{ ...row, reference: "SECOND" }],
          continueCursor: null,
          isDone: true,
        })
      )
    vi.stubGlobal("fetch", fetchMock)
    const response = await GET(
      new Request(
        "http://localhost/api/events/event/orders.csv?itemId=item&fulfillmentType=pickup&progress=cancelled"
      ),
      { params: Promise.resolve({ eventId: "event" }) }
    )
    const bytes = new Uint8Array(await response.arrayBuffer())
    const csv = new TextDecoder().decode(bytes)
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(csv.match(/Order reference/g)).toHaveLength(1)
    expect(csv).toContain("'=formula()")
    expect(csv).toContain('"Ada, ""A"""')
    expect(csv).toContain("cancelled")
    expect(csv).toContain("Fulfillment instructions")
    expect(csv).toContain('"\'=Bring ""ID""\nwith you"')
    expect(csv).toContain("SECOND")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { Authorization: "Bearer owner-token" },
      cache: "no-store",
    })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("cursor=next")
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("itemId=item")
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("progress=cancelled")
  })

  it("returns not found when the initial owner export request fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
    vi.mocked(getToken).mockResolvedValue("owner-token")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("no", { status: 403 }))
    )
    expect(
      (
        await GET(new Request("http://localhost/api/events/event/orders.csv"), {
          params: Promise.resolve({ eventId: "event" }),
        })
      ).status
    ).toBe(404)
  })

  it.each([121, 160, 161])(
    "rejects a %i-character search instead of changing the export filter",
    async (length) => {
      vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
      vi.mocked(getToken).mockResolvedValue("owner-token")
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      const response = await GET(
        new Request(
          `http://localhost/api/events/event/orders.csv?search=${"x".repeat(length)}`
        ),
        { params: Promise.resolve({ eventId: "event" }) }
      )
      expect(response.status).toBe(404)
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it("continues past a filter-empty source page", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
    vi.mocked(getToken).mockResolvedValue("owner-token")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ rows: [], continueCursor: "next", isDone: false })
      )
      .mockResolvedValueOnce(
        Response.json({ rows: [row], continueCursor: null, isDone: true })
      )
    vi.stubGlobal("fetch", fetchMock)
    const response = await GET(
      new Request(
        "http://localhost/api/events/event/orders.csv?itemId=item&paymentStatus=pending_review&fulfillmentOptionId=option"
      ),
      { params: Promise.resolve({ eventId: "event" }) }
    )
    expect(await response.text()).toContain("'=formula()")
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "fulfillmentOptionId=option"
    )
  })

  it("does not truncate more than one thousand logical export rows", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
    vi.mocked(getToken).mockResolvedValue("owner-token")
    let page = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const current = page++
        return Promise.resolve(
          Response.json({
            rows: [{ ...row, reference: `ORDER-${current}` }],
            continueCursor: current === 1000 ? null : `cursor-${current}`,
            isDone: current === 1000,
          })
        )
      })
    )
    const response = await GET(
      new Request("http://localhost/api/events/event/orders.csv"),
      { params: Promise.resolve({ eventId: "event" }) }
    )
    const csv = await response.text()
    expect(csv).toContain("ORDER-1000")
    expect(page).toBe(1001)
  }, 15_000)
})
