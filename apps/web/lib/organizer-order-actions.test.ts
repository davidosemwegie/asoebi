import { describe, expect, it } from "vitest"

import { canOrganizerCancelOrder } from "./organizer-order-actions"

describe("canOrganizerCancelOrder", () => {
  it.each(["pending_review", "confirmed", "rejected"])(
    "shows cancellation alongside the %s payment workflow",
    (paymentStatus) => {
      expect(
        canOrganizerCancelOrder({
          lifecycle: "submitted",
          paymentStatus,
          progress: "pending",
        })
      ).toBe(true)
    }
  )

  it.each([
    { lifecycle: "submitted", progress: "fulfilled" },
    { lifecycle: "submitted", progress: "cancelled" },
    { lifecycle: "cancelled", progress: "cancelled" },
  ])("hides cancellation for terminal order %#", (order) => {
    expect(canOrganizerCancelOrder(order)).toBe(false)
  })
})
