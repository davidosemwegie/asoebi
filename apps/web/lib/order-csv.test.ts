import { describe, expect, it } from "vitest"
import { createOrderCsv, formatEventTime } from "./order-csv"

describe("order CSV", () => {
  it("uses BOM, RFC 4180 quotes, event time zones, and formula-safe cells", () => {
    const csv = createOrderCsv([
      {
        reference: "=cmd()",
        guestName: 'Ada, "A"',
        guestEmail: "ada@example.com",
        guestPhone: "",
        item: "Lace\nGold",
        quantity: 1,
        unitPriceMinor: 1000,
        lineTotalMinor: 1000,
        orderTotalMinor: 1000,
        currency: "NGN",
        paymentStatus: "pending_review",
        progress: "pending",
        fulfillmentType: "pickup",
        fulfillment: "Collection",
        submittedAt: 0,
        reviewedAt: "",
        fulfilledAt: "",
        timeZone: "Africa/Lagos",
      },
    ])
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toContain("'=cmd()")
    expect(csv).toContain('"Ada, ""A"""')
    expect(csv).toContain('"Lace\nGold"')
    expect(csv).toContain("1 Jan 1970")
  })

  it("does not invent a timestamp for a missing value", () => {
    expect(formatEventTime("", "Africa/Lagos")).toBe("")
  })
})
