"use client"

import { useQuery } from "convex/react"
import { CircleAlertIcon, PackageCheckIcon } from "lucide-react"

import { EventDetails } from "@/components/event-details"
import { useEventWorkspace } from "@/components/event-workspace"
import { formatMoney } from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export function EventOverview() {
  const event = useEventWorkspace()
  const summary = useQuery(api.organizerOrders.getSummary, {
    eventId: event._id,
  }) as any
  return (
    <div className="space-y-8">
      {summary === undefined ? (
        <p className="text-base" role="status">
          Loading order overview…
        </p>
      ) : summary ? (
        <section className="space-y-5" aria-label="Order overview">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Submitted orders", summary.submittedOrderCount],
              [
                "Current order value",
                formatMoney(summary.currentOrderValueMinor, summary.currency),
              ],
              ["Needs payment check", summary.paymentsNeedingReview],
              ["Completed orders", summary.completedOrders],
            ].map(([label, value]) => (
              <Card key={String(label)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{label}</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {value}
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CircleAlertIcon aria-hidden="true" />
                Needs your attention
              </CardTitle>
            </CardHeader>
            <CardContent className="text-base">
              {summary.needsAttention} items need a check. Invitations:{" "}
              {summary.invitations.total} total; {summary.invitations.notSent}{" "}
              not sent; {summary.invitations.queued} queued;{" "}
              {summary.invitations.sent} sent; {summary.invitations.delivered}{" "}
              delivered; {summary.invitations.delayed} delayed;{" "}
              {summary.invitations.failed} failed; and{" "}
              {summary.invitations.suppressed} blocked.{" "}
              {summary.invitations.ordersSubmitted} submitted orders and{" "}
              {summary.invitations.ordersCompleted} completed orders came from
              invited guests. {summary.confirmedAwaitingPreparation} confirmed
              orders are waiting to be prepared.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment and progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-base">
              <p>
                Waiting for payment check:{" "}
                {summary.paymentBreakdown.pending_review}. Confirmed:{" "}
                {summary.paymentBreakdown.confirmed}. Rejected:{" "}
                {summary.paymentBreakdown.rejected}.
              </p>
              <p>
                Pending: {summary.progressBreakdown.pending}. Preparing:{" "}
                {summary.progressBreakdown.preparing}. Ready for pickup:{" "}
                {summary.progressBreakdown.ready_for_pickup}. Sent for delivery:{" "}
                {summary.progressBreakdown.dispatched}. Completed:{" "}
                {summary.progressBreakdown.fulfilled}.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <PackageCheckIcon aria-hidden="true" />
                Items requested and set aside
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="hidden overflow-x-auto sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Set aside for orders</TableHead>
                      <TableHead>Available</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.items.map((item: any) => (
                      <TableRow key={item.itemId}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.requested}</TableCell>
                        <TableCell>{item.setAside}</TableCell>
                        <TableCell>{item.available}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid gap-3 sm:hidden">
                {summary.items.map((item: any) => (
                  <Card key={item.itemId}>
                    <CardContent className="space-y-1 pt-4 text-base">
                      <p className="font-semibold">{item.name}</p>
                      <p>Requested: {item.requested}</p>
                      <p>Set aside for orders: {item.setAside}</p>
                      <p>Available: {item.available}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}
      <EventDetails />
    </div>
  )
}
