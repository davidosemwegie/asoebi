export function paymentStatusLabel(value: string) {
  return (
    (
      {
        not_submitted: "Not submitted",
        pending_review: "Waiting for payment check",
        confirmed: "Confirmed",
        rejected: "Rejected",
      } as Record<string, string>
    )[value] ?? value
  )
}

export function progressStatusLabel(value: string) {
  return (
    (
      {
        pending: "Pending",
        preparing: "Preparing",
        ready_for_pickup: "Ready for pickup",
        dispatched: "Sent for delivery",
        fulfilled: "Completed",
        cancelled: "Cancelled",
      } as Record<string, string>
    )[value] ?? value
  )
}
