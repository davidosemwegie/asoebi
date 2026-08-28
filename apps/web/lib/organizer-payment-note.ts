/** Keeps the optional detail-screen note aligned with the backend contract. */
export function optionalPaymentDecisionNote(value: string) {
  const note = value.trim()
  return note || undefined
}
