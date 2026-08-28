export const ORDER_STEPS = [
  "items",
  "fulfillment",
  "details",
  "review",
  "payment",
] as const

export type OrderStep = (typeof ORDER_STEPS)[number]

type RequiredFields =
  | { kind: "pickup"; pickupContact: boolean }
  | {
      kind: "delivery"
      recipientName: boolean
      phoneNumber: boolean
      address: boolean
      availability: boolean
      notes: boolean
    }

type FulfillmentDetails = Record<string, string | undefined>

export function missingRequiredFulfillmentFields(
  requiredFields: RequiredFields | undefined,
  details: FulfillmentDetails | undefined
) {
  if (!requiredFields) return []
  const values = details ?? {}
  if (requiredFields.kind === "pickup") {
    return requiredFields.pickupContact && !values.pickupContact?.trim()
      ? ["pickupContact"]
      : []
  }
  return [
    requiredFields.recipientName && !values.recipientName?.trim()
      ? "recipientName"
      : null,
    requiredFields.phoneNumber && !values.phoneNumber?.trim()
      ? "phoneNumber"
      : null,
    requiredFields.address && !values.address?.trim() ? "address" : null,
    requiredFields.availability && !values.availability?.trim()
      ? "availability"
      : null,
    requiredFields.notes && !values.notes?.trim() ? "notes" : null,
  ].filter((field): field is string => field !== null)
}

export function earliestIncompleteStep(order: {
  lines: Array<unknown>
  fulfillmentOptionId?: unknown
  guestName?: string
  reviewedAt?: number
  fulfillmentRequiredFields?: RequiredFields
  fulfillmentDetails?: FulfillmentDetails
}) {
  if (order.lines.length === 0) return "items" as const
  if (!order.fulfillmentOptionId) return "fulfillment" as const
  if (!order.guestName) return "details" as const
  if (
    missingRequiredFulfillmentFields(
      order.fulfillmentRequiredFields,
      order.fulfillmentDetails
    ).length > 0
  ) {
    return "details" as const
  }
  if (!order.reviewedAt) return "review" as const
  return "payment" as const
}
