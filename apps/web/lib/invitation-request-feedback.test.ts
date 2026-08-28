import { describe, expect, it } from "vitest"

import { invitationRequestFeedback } from "./invitation-request-feedback"

describe("invitation request feedback", () => {
  it("reports an all-success request without empty attention clauses", () => {
    expect(
      invitationRequestFeedback([{ outcome: "queued" }, { outcome: "retried" }])
    ).toEqual({
      type: "success",
      title: "Invitation request saved",
      message: "2 invitations were queued for delivery.",
    })
  })

  it.each([
    ["blocked", "1 guest needs an email correction before sending again."],
    ["already_sent", "1 invitation was already sent or is no longer eligible."],
    [
      "not_found",
      "1 guest could not be found. Refresh the guest list and select them again.",
    ],
  ] as const)("uses singular plain language for %s", (outcome, message) => {
    expect(invitationRequestFeedback([{ outcome }])).toMatchObject({
      type: "error",
      title: "Some guests need attention",
      message,
    })
  })

  it("reports every non-zero outcome in a mixed result", () => {
    const feedback = invitationRequestFeedback([
      { outcome: "queued" },
      { outcome: "retried" },
      { outcome: "blocked" },
      { outcome: "already_sent" },
      { outcome: "not_found" },
    ])

    expect(feedback).toMatchObject({
      type: "error",
      title: "Some guests need attention",
    })
    expect(feedback.message).toBe(
      "2 invitations were queued for delivery. 1 guest needs an email correction before sending again. 1 invitation was already sent or is no longer eligible. 1 guest could not be found. Refresh the guest list and select them again."
    )
  })
})
