import { describe, expect, it } from "vitest"

import { earliestIncompleteStep } from "../lib/order-step-guards"

describe("guest order step guards", () => {
  it("always returns the earliest incomplete step", () => {
    expect(earliestIncompleteStep({ lines: [] })).toBe("items")
    expect(earliestIncompleteStep({ lines: [{}] })).toBe("fulfillment")
    expect(
      earliestIncompleteStep({ lines: [{}], fulfillmentOptionId: "option" })
    ).toBe("details")
    expect(
      earliestIncompleteStep({
        lines: [{}],
        fulfillmentOptionId: "option",
        guestName: "Ada",
      })
    ).toBe("review")
    expect(
      earliestIncompleteStep({
        lines: [{}],
        fulfillmentOptionId: "option",
        guestName: "Ada",
        reviewedAt: 1,
      })
    ).toBe("payment")
  })
})
