/**
 * Keeps the order-detail cancellation control aligned with the organizer
 * transition contract. Payment state intentionally does not affect it.
 */
export function canOrganizerCancelOrder({
  lifecycle,
  progress,
}: {
  lifecycle: string
  progress: string
  paymentStatus?: string
}) {
  return (
    lifecycle === "submitted" &&
    progress !== "fulfilled" &&
    progress !== "cancelled"
  )
}
