"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { CircleAlertIcon } from "lucide-react"

import { formatMoney } from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
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

const paymentWords: Record<string, string> = {
  not_submitted: "Not submitted",
  pending_review: "Waiting for payment check",
  confirmed: "Payment confirmed",
  rejected: "Payment needs attention",
}
const progressWords: Record<string, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  dispatched: "Dispatched",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
}

export function OrderDetail({ orderId }: { orderId: string }) {
  const data = useQuery(api.orders.getMine, { orderId: orderId as never })
  const cancel = useMutation(api.checkout.cancelMine)
  const [error, setError] = useState<string | null>(null)
  if (data === undefined)
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-base">
        Loading your order…
      </main>
    )
  const { order, event, lines, history } = data
  const canCancel =
    order.lifecycle === "submitted" &&
    order.paymentStatus === "pending_review" &&
    event?.orderingOpen
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-base">
      <header>
        <h1 className="font-heading text-3xl font-semibold">
          Order {order.reference}
        </h1>
        <p className="mt-1 text-lg text-muted-foreground">{event?.name}</p>
      </header>
      {error ? (
        <Alert variant="destructive" aria-live="polite">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Could not cancel</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent className="space-y-2 pt-6">
          <p>
            <strong>Payment:</strong> {paymentWords[order.paymentStatus]}
          </p>
          <p>
            <strong>Progress:</strong> {progressWords[order.progress]}
          </p>
          <p>
            <strong>Total:</strong>{" "}
            {formatMoney(order.totalMinor, order.currency ?? "NGN")}
          </p>
          <p>
            <strong>Fulfillment:</strong>{" "}
            {order.fulfillmentOptionName ?? "Not selected"}
          </p>
          {order.fulfillmentInstructions ? (
            <p className="whitespace-pre-wrap text-muted-foreground">
              {order.fulfillmentInstructions}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {lines.map((line) => (
              <li key={line._id} className="flex justify-between gap-3">
                <span>
                  {line.itemName} × {line.quantity}
                </span>
                <span>{formatMoney(line.lineTotalMinor, line.currency)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Order history</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {history.map((entry) => (
              <li key={entry._id}>
                {new Date(entry.createdAt).toLocaleString()}:{" "}
                {paymentWords[entry.paymentStatus]} ·{" "}
                {progressWords[entry.progress]}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      {canCancel ? (
        <Button
          variant="destructive"
          className="min-h-12"
          onClick={() => {
            if (!event?.shareToken) return
            void cancel({
              shareToken: event.shareToken,
              requestId: crypto.randomUUID().replaceAll("-", ""),
            }).catch((cause) =>
              setError(cause instanceof Error ? cause.message : "Try again.")
            )
          }}
        >
          Cancel order
        </Button>
      ) : null}
      {event?.shareToken && order.paymentStatus === "pending_review" ? (
        <Button
          nativeButton={false}
          render={<Link href={`/e/${event.shareToken}/order/items`} />}
          className="min-h-12 text-lg"
        >
          Edit order
        </Button>
      ) : null}
      {event?.shareToken && order.paymentStatus === "rejected" ? (
        <Button
          nativeButton={false}
          render={<Link href={`/e/${event.shareToken}/order/items`} />}
          className="min-h-12 text-lg"
        >
          Update and resubmit
        </Button>
      ) : null}
    </main>
  )
}
