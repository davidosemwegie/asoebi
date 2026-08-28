export const ORDER_STEPS = [
  "items",
  "fulfillment",
  "details",
  "review",
  "payment",
] as const

export type OrderStep = (typeof ORDER_STEPS)[number]

export function earliestIncompleteStep(order: {
  lines: Array<unknown>
  fulfillmentOptionId?: unknown
  guestName?: string
  reviewedAt?: number
}) {
  if (order.lines.length === 0) return "items" as const
  if (!order.fulfillmentOptionId) return "fulfillment" as const
  if (!order.guestName) return "details" as const
  if (!order.reviewedAt) return "review" as const
  return "payment" as const
}
