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

export function quantitiesOverAvailability(
  items: Array<{
    _id: string
    name: string
    availableQuantity: number
  }>,
  quantities: Record<string, number>
) {
  return items.flatMap((item) => {
    const selectedQuantity = quantities[item._id] ?? 0
    return selectedQuantity > item.availableQuantity
      ? [
          {
            itemId: item._id,
            itemName: item.name,
            selectedQuantity,
            availableQuantity: item.availableQuantity,
          },
        ]
      : []
  })
}

export function unreservedQuantityAvailabilityIssues({
  items,
  quantities,
  reservationState,
}: {
  items: Array<{
    _id: string
    name: string
    availableQuantity: number
  }>
  quantities: Record<string, number>
  reservationState: string | undefined
}) {
  return reservationState === "reserved"
    ? []
    : quantitiesOverAvailability(items, quantities)
}

export function canGuestCancelOrder({
  lifecycle,
  paymentStatus,
  orderingOpen,
}: {
  lifecycle: string
  paymentStatus: string
  orderingOpen: boolean
}) {
  return (
    lifecycle === "submitted" &&
    paymentStatus === "pending_review" &&
    orderingOpen
  )
}

export function canShowOrderConfirmation(
  order: { lifecycle: string; paymentStatus: string } | null | undefined
) {
  return (
    order?.lifecycle === "submitted" && order.paymentStatus === "pending_review"
  )
}

export function earliestIncompleteStep(order: {
  lines: Array<unknown>
  hasQuantityExceedingAvailability?: boolean
  fulfillmentOptionId?: unknown
  guestName?: string
  reviewedAt?: number
  fulfillmentRequiredFields?: RequiredFields
  fulfillmentDetails?: FulfillmentDetails
}) {
  if (order.hasQuantityExceedingAvailability) return "items" as const
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
