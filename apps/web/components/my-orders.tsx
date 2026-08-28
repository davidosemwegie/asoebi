"use client"

import Link from "next/link"
import { useQuery } from "convex/react"

import { formatMoney } from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { ShoppingBagIcon } from "lucide-react"

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

export function MyOrders() {
  const result = useQuery(api.orders.listMine, {
    paginationOpts: { cursor: null, numItems: 20 },
  })
  if (result === undefined)
    return (
      <Card>
        <CardContent className="py-8 text-base">
          Loading your orders…
        </CardContent>
      </Card>
    )
  if (result.page.length === 0)
    return (
      <Empty className="min-h-56 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShoppingBagIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-base">No orders yet</EmptyTitle>
          <EmptyDescription className="text-base">
            You have not placed an order yet. Orders from private events will
            appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {result.page.map((order) => (
        <Link
          key={order._id}
          href={`/orders/${order._id}`}
          className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">{order.eventName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-base">
              <p className="font-medium">{order.reference}</p>
              <p>{paymentWords[order.paymentStatus]}</p>
              <p>{progressWords[order.progress]}</p>
              <p className="font-semibold">
                {formatMoney(order.totalMinor, order.currency ?? "NGN")}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
