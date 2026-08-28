"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"

import { useEventWorkspace } from "@/components/event-workspace"
import { formatMoney } from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

type Detail = {
  order: {
    reference: string
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
  }>
  receiptAvailable: boolean
  fulfillmentOptionName?: string
  fulfillmentInstructions?: string
  fulfillmentDetails?: Record<string, string | undefined>
}

export function OrganizerOrderDetail({ orderId }: { orderId: string }) {
  const event = useEventWorkspace()
  const orderKey = orderId as Id<"orders">
  const [message, setMessage] = useState<string>()
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [notificationCursor, setNotificationCursor] = useState<string | null>(
    null
  )
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
  const run = async (operation: () => Promise<unknown>) => {
    setMessage(undefined)
    try {
      await operation()
      setMessage("Order updated.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.")
    }
  }

  if (detail === undefined) return <p className="text-base">Loading order…</p>
  if (detail === null)
    return <p className="text-base">This order is not available.</p>
  const { order } = detail
  const action =
    order.paymentStatus === "pending_review" ? (
      <div className="flex flex-wrap gap-3">
        <Button
          className="min-h-12"
          onClick={() =>
            void run(() =>
              decide({
                eventId: event._id,
                orderId: orderKey,
                decision: "confirmed",
              })
            )
          }
        >
          Confirm payment
        </Button>
        <Button
          variant="outline"
          className="min-h-12"
          onClick={() =>
            void run(() =>
              decide({
                eventId: event._id,
                orderId: orderKey,
                decision: "rejected",
              })
            )
          }
        >
          Reject payment
        </Button>
      </div>
    ) : order.paymentStatus === "confirmed" &&
      order.progress !== "fulfilled" ? (
      <Button
        className="min-h-12"
        onClick={() =>
          void run(() => advance({ eventId: event._id, orderId: orderKey }))
        }
      >
        Move to next step
      </Button>
    ) : order.progress !== "fulfilled" && order.progress !== "cancelled" ? (
      <Button
        variant="destructive"
        className="min-h-12"
        onClick={() =>
          void run(() => cancel({ eventId: event._id, orderId: orderKey }))
        }
      >
        Cancel order
      </Button>
    ) : null
  const history = historyResult?.page ?? detail.history
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
          variant={message === "Order updated." ? "default" : "destructive"}
        >
          <AlertTitle>
            {message === "Order updated."
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
          <p>Payment: {order.paymentStatus.replaceAll("_", " ")}</p>
          <p>Progress: {order.progress.replaceAll("_", " ")}</p>
          <p>Pickup or delivery: {order.fulfillmentType ?? "Not selected"}</p>
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
                {new Date(entry.createdAt).toLocaleString()}:{" "}
                {entry.paymentStatus.replaceAll("_", " ")} ·{" "}
                {entry.progress.replaceAll("_", " ")}
                {entry.note ? ` — ${entry.note}` : ""}
              </li>
            ))}
          </ol>
          {historyResult?.continueCursor ? (
            <Button
              variant="outline"
              className="mt-4 min-h-11"
              onClick={() => setHistoryCursor(historyResult.continueCursor)}
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
            notifications.page.map((notification) => (
              <div
                key={notification._id}
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0"
              >
                <p>
                  {notification.subject}:{" "}
                  {notification.status.replaceAll("_", " ")} (attempt{" "}
                  {notification.latestAttemptNumber})
                </p>
                {notification.status === "delayed" ||
                notification.status === "failed" ? (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() =>
                      void run(() =>
                        retry({ notificationId: notification._id })
                      )
                    }
                  >
                    Retry email
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <p>No email messages have been scheduled for this order.</p>
          )}
          {notifications?.continueCursor ? (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() =>
                setNotificationCursor(notifications.continueCursor)
              }
            >
              More email history
            </Button>
          ) : null}
        </CardContent>
      </Card>
      {action}
    </section>
  )
}
