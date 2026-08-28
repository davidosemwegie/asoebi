import { describe, expect, it } from "vitest"

import {
  earliestIncompleteStep,
  missingRequiredFulfillmentFields,
} from "../lib/order-step-guards"

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

  it("holds direct review and payment links at details until configured fields are complete", () => {
    const requiredFields = {
      kind: "delivery" as const,
      recipientName: true,
      phoneNumber: true,
      address: true,
      availability: false,
      notes: false,
    }
    expect(
      earliestIncompleteStep({
        lines: [{}],
        fulfillmentOptionId: "option",
        guestName: "Ada",
        reviewedAt: 1,
        fulfillmentRequiredFields: requiredFields,
        fulfillmentDetails: { recipientName: "Ada" },
      })
    ).toBe("details")
    expect(
      missingRequiredFulfillmentFields(requiredFields, {
        recipientName: "Ada",
        phoneNumber: "0800",
        address: "1 Main Street",
      })
    ).toEqual([])
    expect(
      earliestIncompleteStep({
        lines: [{}],
        fulfillmentOptionId: "option",
        guestName: "Ada",
        fulfillmentRequiredFields: requiredFields,
        fulfillmentDetails: {
          recipientName: "Ada",
          phoneNumber: "0800",
          address: "1 Main Street",
        },
      })
    ).toBe("review")
  })
})
