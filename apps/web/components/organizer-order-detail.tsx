"use client"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { useEventWorkspace } from "@/components/event-workspace"
import { api } from "@workspace/backend/convex/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function OrganizerOrderDetail({ orderId }: { orderId: string }) {
  const event = useEventWorkspace()
  const detail = useQuery((api as any).organizerOrders.getDetail, {
    eventId: event._id,
    orderId,
  }) as any
  const decide = useMutation((api as any).organizerOrders.decidePayment)
  const advance = useMutation((api as any).organizerOrders.advanceFulfillment)
  const cancel = useMutation((api as any).organizerOrders.cancel)
  if (!detail) return <p className="text-base">Loading order…</p>
  const order = detail.order
  const action =
    order.paymentStatus === "pending_review" ? (
      <div className="flex flex-wrap gap-3">
        <Button
          className="min-h-12"
          onClick={() =>
            void decide({ eventId: event._id, orderId, decision: "confirmed" })
          }
        >
          Confirm payment
        </Button>
        <Button
          variant="outline"
          className="min-h-12"
          onClick={() =>
            void decide({ eventId: event._id, orderId, decision: "rejected" })
          }
        >
          Reject payment
        </Button>
      </div>
    ) : order.paymentStatus === "confirmed" &&
      order.progress !== "fulfilled" ? (
      <Button
        className="min-h-12"
        onClick={() => void advance({ eventId: event._id, orderId })}
      >
        Move to next step
      </Button>
    ) : order.progress !== "fulfilled" && order.progress !== "cancelled" ? (
      <Button
        variant="destructive"
        className="min-h-12"
        onClick={() => void cancel({ eventId: event._id, orderId })}
      >
        Cancel order
      </Button>
    ) : null
  return (
    <section className="space-y-5">
      <Button
        nativeButton={false}
        variant="outline"
        render={<Link href={`/events/${event._id}/orders`} />}
      >
        Back to orders
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{order.reference}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-base">
          <p>
            Guest: {order.guestName}{" "}
            {order.guestEmail ? `(${order.guestEmail})` : ""}
          </p>
          <p>Payment: {order.paymentStatus.replaceAll("_", " ")}</p>
          <p>Progress: {order.progress.replaceAll("_", " ")}</p>
          <p>Pickup or delivery: {order.fulfillmentType ?? "Not selected"}</p>
          {detail.receiptAvailable ? (
            <a className="underline" href={`/api/orders/${orderId}/receipt`}>
              View private payment receipt
            </a>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Items and totals</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-base">
            {detail.lines.map((line: any) => (
              <li key={line._id}>
                {line.itemName} × {line.quantity} — {line.currency}{" "}
                {line.lineTotalMinor.toLocaleString()}
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
          <ol className="space-y-3 text-base">
            {detail.history.map((entry: any) => (
              <li key={entry._id}>
                {new Date(entry.createdAt).toLocaleString()}:{" "}
                {entry.paymentStatus.replaceAll("_", " ")} ·{" "}
                {entry.progress.replaceAll("_", " ")}
                {entry.note ? ` — ${entry.note}` : ""}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      {action}
    </section>
  )
}
