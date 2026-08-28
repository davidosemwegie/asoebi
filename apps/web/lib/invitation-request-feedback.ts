type InvitationRequestResult = {
  outcome: "queued" | "retried" | "already_sent" | "blocked" | "not_found"
}

export function invitationRequestFeedback(results: InvitationRequestResult[]) {
  const queued = results.filter(
    (item) => item.outcome === "queued" || item.outcome === "retried"
  ).length
  const blocked = results.filter((item) => item.outcome === "blocked").length
  const alreadySent = results.filter(
    (item) => item.outcome === "already_sent"
  ).length
  const notFound = results.filter((item) => item.outcome === "not_found").length
  const needsAttention = blocked + alreadySent + notFound > 0
  const clauses: string[] = []
  if (queued > 0) {
    clauses.push(
      `${queued} invitation${queued === 1 ? " was" : "s were"} queued for delivery.`
    )
  }
  if (blocked > 0) {
    clauses.push(
      `${blocked} guest${blocked === 1 ? " needs" : "s need"} an email correction before sending again.`
    )
  }
  if (alreadySent > 0) {
    clauses.push(
      `${alreadySent} invitation${alreadySent === 1 ? " was" : "s were"} already sent or ${alreadySent === 1 ? "is" : "are"} no longer eligible.`
    )
  }
  if (notFound > 0) {
    clauses.push(
      `${notFound} guest${notFound === 1 ? " could" : "s could"} not be found. Refresh the guest list and select them again.`
    )
  }

  return {
    type: needsAttention ? ("error" as const) : ("success" as const),
    title: needsAttention
      ? "Some guests need attention"
      : "Invitation request saved",
    message: clauses.join(" "),
  }
}
