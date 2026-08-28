"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { LoaderCircleIcon } from "lucide-react"

import { useEventWorkspace } from "@/components/event-workspace"
import { formatMoney } from "@/lib/money"
import { canOrganizerCancelOrder } from "@/lib/organizer-order-actions"
import { optionalPaymentDecisionNote } from "@/lib/organizer-payment-note"
import { paymentStatusLabel, progressStatusLabel } from "@/lib/order-status"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

type Detail = {
  order: {
    reference: string
    lifecycle: string
    guestName: string
    guestEmail?: string
    guestPhone?: string
    paymentStatus: string
    progress: string
    fulfillmentType?: string
    currency: string
    itemSubtotalMinor: number
    fulfillmentFeeMinor: number
    totalMinor: number
  }
  lines: Array<{
    _id: string
    itemName: string
    quantity: number
    lineTotalMinor: number
    currency: string
  }>
  history: Array<{
    _id: string
    createdAt: number
    paymentStatus: string
    progress: string
    note?: string
    actorRole: "guest" | "organizer" | "system"
    actorUserId: string
  }>
  eventTimeZone: string
  receiptAvailable: boolean
  fulfillmentOptionName?: string
  fulfillmentInstructions?: string
  fulfillmentDetails?: Record<string, string | undefined>
}

export function OrganizerOrderDetail({ orderId }: { orderId: string }) {
  const event = useEventWorkspace()
  const orderKey = orderId as Id<"orders">
  const [message, setMessage] = useState<string>()
  const [paymentNote, setPaymentNote] = useState("")
  const [isMutating, setIsMutating] = useState(false)
  const [confirmation, setConfirmation] = useState<"reject" | "cancel" | null>(
    null
  )
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [historyPages, setHistoryPages] = useState<Detail["history"]>([])
  const [notificationCursor, setNotificationCursor] = useState<string | null>(
    null
  )
  const [notificationPages, setNotificationPages] = useState<
    Array<{
      _id: Id<"notifications">
      subject: string
      status: string
      latestAttemptNumber: number
      retryBlockedReason?: string
    }>
  >([])
  const detail = useQuery(api.organizerOrders.getDetail, {
    eventId: event._id,
    orderId: orderKey,
  }) as Detail | null | undefined
  const historyResult = useQuery(api.organizerOrders.listHistory, {
    eventId: event._id,
    orderId: orderKey,
    paginationOpts: { numItems: 20, cursor: historyCursor },
  })
  const notifications = useQuery(api.notifications.listOrderHistory, {
    eventId: event._id,
    orderId: orderKey,
    paginationOpts: { numItems: 20, cursor: notificationCursor },
  })
  const decide = useMutation(api.organizerOrders.decidePayment)
  const advance = useMutation(api.organizerOrders.advanceFulfillment)
  const cancel = useMutation(api.organizerOrders.cancel)
  const retry = useMutation(api.notifications.retryMine)
  const run = async (
    operation: () => Promise<unknown>,
    successMessage = "Order updated."
  ) => {
    if (isMutating) return false
    setMessage(undefined)
    setIsMutating(true)
    try {
      await operation()
      setMessage(successMessage)
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.")
      return false
    } finally {
      setIsMutating(false)
    }
  }

  if (detail === undefined) return <p className="text-base">Loading order…</p>
  if (detail === null)
    return <p className="text-base">This order is not available.</p>
  const { order } = detail
  const normalizedPaymentNote = optionalPaymentDecisionNote(paymentNote)
  const canCancelOrder = canOrganizerCancelOrder(order)
  const action =
    canCancelOrder && order.paymentStatus === "pending_review" ? (
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor="payment-decision-note" className="text-base">
            Note for this payment decision (optional)
          </Label>
          <Textarea
            id="payment-decision-note"
            value={paymentNote}
            maxLength={500}
            disabled={isMutating}
            onChange={(input) => setPaymentNote(input.target.value)}
            className="min-h-24 text-base"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            className="min-h-12"
            disabled={isMutating}
            onClick={() =>
              void run(() =>
                decide({
                  eventId: event._id,
                  orderId: orderKey,
                  decision: "confirmed",
                  note: normalizedPaymentNote,
                })
              )
            }
          >
            Confirm payment
          </Button>
          <Button
            variant="outline"
            className="min-h-12"
            disabled={isMutating}
            onClick={() => setConfirmation("reject")}
          >
            Reject payment
          </Button>
        </div>
      </div>
    ) : canCancelOrder && order.paymentStatus === "confirmed" ? (
      <Button
        className="min-h-12"
        disabled={isMutating}
        onClick={() =>
          void run(() => advance({ eventId: event._id, orderId: orderKey }))
        }
      >
        Move to next step
      </Button>
    ) : null
  const history = [...historyPages, ...(historyResult?.page ?? detail.history)]
  return (
    <section className="space-y-5">
      <Button
        nativeButton={false}
        variant="outline"
        className="min-h-11"
        render={<Link href={`/events/${event._id}/orders`} />}
      >
        Back to orders
      </Button>
      {message ? (
        <Alert
          variant={
            message !== "Order updated." && message !== "Email retry scheduled."
              ? "destructive"
              : "default"
          }
          aria-live="polite"
        >
          <AlertTitle>
            {message === "Order updated." ||
            message === "Email retry scheduled."
              ? "Saved"
              : "We could not update this order"}
          </AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{order.reference}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-base">
          <p>
            Guest: {order.guestName}
            {order.guestEmail ? ` (${order.guestEmail})` : ""}
          </p>
          {order.guestPhone ? <p>Phone: {order.guestPhone}</p> : null}
          <p>Payment: {paymentStatusLabel(order.paymentStatus)}</p>
          <p>Progress: {progressStatusLabel(order.progress)}</p>
          <p>
            Pickup or delivery:{" "}
            {order.fulfillmentType === "delivery"
              ? "Delivery"
              : order.fulfillmentType === "pickup"
                ? "Pickup"
                : "Not selected"}
          </p>
          <p>Option: {detail.fulfillmentOptionName ?? "Not selected"}</p>
          {detail.fulfillmentInstructions ? (
            <p>Instructions: {detail.fulfillmentInstructions}</p>
          ) : null}
          {detail.fulfillmentDetails ? (
            <p>
              Guest details:{" "}
              {Object.values(detail.fulfillmentDetails)
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {detail.receiptAvailable ? (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={`/api/orders/${orderId}/receipt`}
            >
              View private payment receipt
            </a>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Items and totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-base">
          <ul className="space-y-2">
            {detail.lines.map((line) => (
              <li key={line._id}>
                {line.itemName} × {line.quantity} —{" "}
                {formatMoney(line.lineTotalMinor, line.currency)}
              </li>
            ))}
          </ul>
          <dl className="grid gap-2">
            <div className="flex justify-between gap-4">
              <dt>Items subtotal</dt>
              <dd>
                {formatMoney(
                  order.itemSubtotalMinor,
                  order.currency || event.currency
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Pickup or delivery fee</dt>
              <dd>
                {formatMoney(
                  order.fulfillmentFeeMinor,
                  order.currency || event.currency
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4 font-semibold">
              <dt>Total</dt>
              <dd>
                {formatMoney(
                  order.totalMinor,
                  order.currency || event.currency
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Order history</CardTitle>
        </CardHeader>
        <CardContent className="text-base">
          <ol className="space-y-3">
            {history.map((entry) => (
              <li key={entry._id}>
                {new Intl.DateTimeFormat("en", {
                  timeZone: detail.eventTimeZone,
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(entry.createdAt)}{" "}
                ({detail.eventTimeZone}) —{" "}
                {entry.actorRole === "organizer"
                  ? "Organizer"
                  : entry.actorRole === "guest"
                    ? "Guest"
                    : "System"}
                : {paymentStatusLabel(entry.paymentStatus)} ·{" "}
                {progressStatusLabel(entry.progress)}
                {entry.note ? ` — ${entry.note}` : ""}
              </li>
            ))}
          </ol>
          {historyResult?.continueCursor ? (
            <Button
              variant="outline"
              className="mt-4 min-h-11"
              onClick={() => {
                setHistoryPages((pages) => [...pages, ...historyResult.page])
                setHistoryCursor(historyResult.continueCursor)
              }}
            >
              More history
            </Button>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-base">
          {notifications === undefined ? (
            <p>Loading email status…</p>
          ) : notifications.page.length ? (
            [...notificationPages, ...notifications.page].map(
              (notification) => (
                <div
                  key={notification._id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0"
                >
                  <p>
                    {notification.subject}:{" "}
                    {notification.status.replaceAll("_", " ")} (attempt{" "}
                    {notification.latestAttemptNumber})
                  </p>
                  {(notification.status === "delayed" ||
                    notification.status === "failed") &&
                  !notification.retryBlockedReason ? (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={isMutating}
                      onClick={() =>
                        void run(
                          () => retry({ notificationId: notification._id }),
                          "Email retry scheduled."
                        )
                      }
                    >
                      Retry email
                    </Button>
                  ) : notification.retryBlockedReason ? (
                    <p>{notification.retryBlockedReason}</p>
                  ) : null}
                </div>
              )
            )
          ) : (
            <p>No email messages have been scheduled for this order.</p>
          )}
          {notifications?.continueCursor ? (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setNotificationPages((pages) => [
                  ...pages,
                  ...notifications.page,
                ])
                setNotificationCursor(notifications.continueCursor)
              }}
            >
              More email history
            </Button>
          ) : null}
        </CardContent>
      </Card>
      {action ? (
        <Card>
          <CardHeader>
            <CardTitle>Next action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-base">
            {action}
            {canCancelOrder ? (
              <div className="border-t pt-4">
                <p className="mb-3">
                  Need to stop this order? Cancelling releases any items set
                  aside for it and cannot be undone.
                </p>
                <Button
                  variant="destructive"
                  className="min-h-12"
                  disabled={isMutating}
                  onClick={() => setConfirmation("cancel")}
                >
                  Cancel order
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : canCancelOrder ? (
        <Card>
          <CardHeader>
            <CardTitle>Order actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-base">
            <p>
              Need to stop this order? Cancelling releases any items set aside
              for it and cannot be undone.
            </p>
            <Button
              variant="destructive"
              className="min-h-12"
              disabled={isMutating}
              onClick={() => setConfirmation("cancel")}
            >
              Cancel order
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !isMutating) setConfirmation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === "reject"
                ? "Reject this payment?"
                : "Cancel this order?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {confirmation === "reject"
                ? "The guest can submit a new payment receipt if stock is still available."
                : "This releases any items set aside for this order. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="min-h-11 text-base"
              disabled={isMutating}
            >
              Keep order
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 text-base"
              disabled={isMutating}
              onClick={() => {
                const operation =
                  confirmation === "reject"
                    ? () =>
                        decide({
                          eventId: event._id,
                          orderId: orderKey,
                          decision: "rejected",
                          note: normalizedPaymentNote,
                        })
                    : () => cancel({ eventId: event._id, orderId: orderKey })
                void run(operation).then((succeeded) => {
                  if (succeeded) setConfirmation(null)
                })
              }}
            >
              {isMutating ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {confirmation === "reject" ? "Reject payment" : "Cancel order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
