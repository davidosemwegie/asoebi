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

  return {
    type: needsAttention ? ("error" as const) : ("success" as const),
    title: needsAttention
      ? "Some guests need attention"
      : "Invitation request saved",
    message: `${queued} queued for delivery. ${blocked} need an email correction. ${alreadySent} were already sent or are no longer eligible. ${notFound} could not be found; refresh the guest list and select them again.`,
  }
}
