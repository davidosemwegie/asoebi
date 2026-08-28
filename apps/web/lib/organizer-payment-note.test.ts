import { describe, expect, it } from "vitest"

import { optionalPaymentDecisionNote } from "./organizer-payment-note"

describe("optionalPaymentDecisionNote", () => {
  it("forwards a trimmed note to either payment decision", () => {
    expect(optionalPaymentDecisionNote("  Receipt checked.  ")).toBe(
      "Receipt checked."
    )
  })

  it("forwards an empty note as undefined", () => {
    expect(optionalPaymentDecisionNote("   ")).toBeUndefined()
  })
})
