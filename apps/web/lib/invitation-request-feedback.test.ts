import { describe, expect, it } from "vitest"

import { invitationRequestFeedback } from "./invitation-request-feedback"

describe("invitation request feedback", () => {
  it("makes already-sent and missing guests an attention result", () => {
    const feedback = invitationRequestFeedback([
      { outcome: "queued" },
      { outcome: "blocked" },
      { outcome: "already_sent" },
      { outcome: "not_found" },
    ])

    expect(feedback).toMatchObject({
      type: "error",
      title: "Some guests need attention",
    })
    expect(feedback.message).toContain("1 queued for delivery")
    expect(feedback.message).toContain("1 need an email correction")
    expect(feedback.message).toContain("1 were already sent")
    expect(feedback.message).toContain("1 could not be found")
  })
})
