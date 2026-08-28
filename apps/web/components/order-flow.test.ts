import { describe, expect, it } from "vitest"

import {
  canShowOrderConfirmation,
  canGuestCancelOrder,
  earliestIncompleteStep,
  missingRequiredFulfillmentFields,
  unreservedQuantityAvailabilityIssues,
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

  it("holds unreserved draft and rejected orders at items when stock changes", () => {
    const items = [
      {
        _id: "item-a",
        name: "Blue fabric",
        availableQuantity: 2,
      },
      {
        _id: "item-b",
        name: "Cap",
        availableQuantity: 5,
      },
    ]
    const quantities = { "item-a": 4, "item-b": 2 }
    const draftIssues = unreservedQuantityAvailabilityIssues({
      items,
      quantities,
      reservationState: "none",
    })
    const rejectedIssues = unreservedQuantityAvailabilityIssues({
      items,
      quantities,
      reservationState: "released",
    })

    expect(draftIssues).toEqual([
      {
        itemId: "item-a",
        itemName: "Blue fabric",
        selectedQuantity: 4,
        availableQuantity: 2,
      },
    ])
    expect(rejectedIssues).toEqual(draftIssues)
    expect(
      unreservedQuantityAvailabilityIssues({
        items,
        quantities,
        reservationState: "reserved",
      })
    ).toEqual([])
    expect(
      earliestIncompleteStep({
        lines: [{}],
        hasQuantityExceedingAvailability: draftIssues.length > 0,
        fulfillmentOptionId: "option",
        guestName: "Ada",
        reviewedAt: 1,
      })
    ).toBe("items")
  })

  it("only enables order cancellation while payment is waiting for review and ordering remains open", () => {
    expect(
      canGuestCancelOrder({
        lifecycle: "submitted",
        paymentStatus: "pending_review",
        orderingOpen: true,
      })
    ).toBe(true)
    expect(
      canGuestCancelOrder({
        lifecycle: "submitted",
        paymentStatus: "confirmed",
        orderingOpen: true,
      })
    ).toBe(false)
    expect(
      canGuestCancelOrder({
        lifecycle: "submitted",
        paymentStatus: "pending_review",
        orderingOpen: false,
      })
    ).toBe(false)
  })

  it("shows the submission confirmation only while payment awaits review", () => {
    expect(
      canShowOrderConfirmation({
        lifecycle: "submitted",
        paymentStatus: "pending_review",
      })
    ).toBe(true)
    expect(
      canShowOrderConfirmation({
        lifecycle: "submitted",
        paymentStatus: "confirmed",
      })
    ).toBe(false)
    expect(
      canShowOrderConfirmation({
        lifecycle: "submitted",
        paymentStatus: "rejected",
      })
    ).toBe(false)
    expect(
      canShowOrderConfirmation({
        lifecycle: "draft",
        paymentStatus: "not_submitted",
      })
    ).toBe(false)
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
