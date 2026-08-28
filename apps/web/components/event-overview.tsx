"use client"

import { Component, type ReactNode } from "react"
import { useQuery } from "convex/react"
import { CircleAlertIcon, PackageCheckIcon } from "lucide-react"

import { EventDetails } from "@/components/event-details"
import { useEventWorkspace } from "@/components/event-workspace"
import { formatMoney } from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
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

type Summary = {
  currency: string
  submittedOrderCount: number
  currentOrderValueMinor: number
  paymentsNeedingReview: number
  completedOrders: number
  confirmedAwaitingPreparation: number
  lifecycleEmailNeedsAttention: number
  lifecycleEmail: {
    scheduled: number
    queued: number
    sent: number
    delivered: number
    delayed: number
    failed: number
    bounced: number
    complained: number
    suppressed: number
  }
  needsAttention: number
  paymentBreakdown: Record<string, number>
  progressBreakdown: Record<string, number>
  items: Array<{
    itemId: string
    name: string
    requested: number
    setAside: number
    available: number
  }>
  invitations: {
    total: number
    notSent: number
    queued: number
    sent: number
    delivered: number
    delayed: number
    failed: number
    suppressed: number
    ordersSubmitted: number
    ordersCompleted: number
  }
}

class OverviewErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <Alert variant="destructive" aria-live="polite">
          <AlertTitle>We could not load the order overview</AlertTitle>
          <AlertDescription>
            Please refresh the page. If this continues, check your connection
            and try again.
          </AlertDescription>
        </Alert>
      )
    }
    return this.props.children
  }
}

function OrganizerOverview() {
  const event = useEventWorkspace()
  const summary = useQuery(api.organizerOrders.getSummary, {
    eventId: event._id,
  }) as Summary | undefined

  if (summary === undefined) {
    return (
      <Card aria-busy="true">
        <CardContent className="pt-5 text-base" role="status">
          Loading order overview…
        </CardContent>
      </Card>
    )
  }

  return (
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
          {summary.invitations.total} total; {summary.invitations.notSent} not
          sent; {summary.invitations.queued} queued; {summary.invitations.sent}{" "}
          sent; {summary.invitations.delivered} delivered;{" "}
          {summary.invitations.delayed} delayed; {summary.invitations.failed}{" "}
          failed; and {summary.invitations.suppressed} blocked.{" "}
          {summary.invitations.ordersSubmitted} submitted orders and{" "}
          {summary.invitations.ordersCompleted} completed orders came from
          invited guests. {summary.confirmedAwaitingPreparation} confirmed
          orders are waiting to be prepared. Order update emails needing
          attention: {summary.lifecycleEmailNeedsAttention}. Delayed:{" "}
          {summary.lifecycleEmail.delayed ?? 0}; failed:{" "}
          {summary.lifecycleEmail.failed ?? 0}; bounced:{" "}
          {summary.lifecycleEmail.bounced ?? 0}; complaints:{" "}
          {summary.lifecycleEmail.complained ?? 0}; blocked:{" "}
          {summary.lifecycleEmail.suppressed ?? 0}.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment and progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-base">
          <p>
            Not submitted: {summary.paymentBreakdown.not_submitted ?? 0}.{" "}
            Waiting for payment check:{" "}
            {summary.paymentBreakdown.pending_review ?? 0}. Confirmed:{" "}
            {summary.paymentBreakdown.confirmed ?? 0}. Rejected:{" "}
            {summary.paymentBreakdown.rejected ?? 0}.
          </p>
          <p>
            Pending: {summary.progressBreakdown.pending ?? 0}. Preparing:{" "}
            {summary.progressBreakdown.preparing ?? 0}. Ready for pickup:{" "}
            {summary.progressBreakdown.ready_for_pickup ?? 0}. Sent for
            delivery: {summary.progressBreakdown.dispatched ?? 0}. Completed:{" "}
            {summary.progressBreakdown.fulfilled ?? 0}. Cancelled:{" "}
            {summary.progressBreakdown.cancelled ?? 0}.
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
            <Table className="[&_td]:text-base [&_th]:text-base">
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Set aside for orders</TableHead>
                  <TableHead>Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.items.map((item) => (
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
            {summary.items.map((item) => (
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
  )
}

export function EventOverview() {
  return (
    <div className="space-y-8">
      <OverviewErrorBoundary>
        <OrganizerOverview />
      </OverviewErrorBoundary>
      <EventDetails />
    </div>
  )
}
