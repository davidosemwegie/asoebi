"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  LoaderCircleIcon,
} from "lucide-react"

import { formatMoney } from "@/lib/money"
import { canGuestCancelOrder } from "@/lib/order-step-guards"
import { api } from "@workspace/backend/convex/_generated/api"
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
  dispatched: "Sent for delivery",
  fulfilled: "Completed",
  cancelled: "Cancelled",
}

export function OrderDetail({ orderId }: { orderId: string }) {
  const data = useQuery(api.orders.getMine, { orderId })
  const cancel = useMutation(api.checkout.cancelMine)
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  if (data === undefined)
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-base">
        Loading your order…
      </main>
    )
  if (!data)
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-lg">
        Order unavailable.
      </main>
    )
  const { order, event, lines, history } = data
  const canCancel = canGuestCancelOrder({
    lifecycle: order.lifecycle,
    paymentStatus: order.paymentStatus,
    orderingOpen: Boolean(event?.orderingOpen),
  })
  const cancelled =
    order.lifecycle === "cancelled" || order.progress === "cancelled"

  const cancelOrder = async () => {
    if (!event?.shareToken || isCancelling) return
    setError(null)
    setIsCancelling(true)
    try {
      await cancel({
        shareToken: event.shareToken,
        requestId: crypto.randomUUID().replaceAll("-", ""),
      })
      window.sessionStorage.removeItem(`asoebi:order-edit:${order._id}`)
      setCancelOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Try again.")
    } finally {
      setIsCancelling(false)
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-lg">
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
      {cancelled ? (
        <Alert aria-live="polite">
          <CheckCircle2Icon aria-hidden="true" />
          <AlertTitle>Order cancelled</AlertTitle>
          <AlertDescription>
            This order has been cancelled. The organizer will handle any payment
            arrangements outside Asoebi.
          </AlertDescription>
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
          onClick={() => setCancelOpen(true)}
        >
          Cancel order
        </Button>
      ) : null}
      {event?.shareToken &&
      event.orderingOpen &&
      order.paymentStatus === "pending_review" ? (
        <Button
          nativeButton={false}
          render={<Link href={`/e/${event.shareToken}/order/items`} />}
          className="min-h-12 text-lg"
        >
          Edit order
        </Button>
      ) : null}
      {event?.shareToken &&
      event.orderingOpen &&
      order.paymentStatus === "rejected" ? (
        <Button
          nativeButton={false}
          render={<Link href={`/e/${event.shareToken}/order/items`} />}
          className="min-h-12 text-lg"
        >
          Update and resubmit
        </Button>
      ) : null}
      <AlertDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          if (!isCancelling) setCancelOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">
              Cancel order {order.reference}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-lg">
              This releases the items set aside for your order. Any payment
              arrangement is handled with the organizer outside Asoebi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="min-h-11 px-4 text-lg"
              disabled={isCancelling}
            >
              Keep order
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="min-h-11 px-4 text-lg"
              disabled={isCancelling}
              onClick={() => void cancelOrder()}
            >
              {isCancelling ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {isCancelling ? "Cancelling…" : "Cancel order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
