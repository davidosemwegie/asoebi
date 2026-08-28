"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "convex/react"
import { DownloadIcon, FilterIcon } from "lucide-react"
import { useEventWorkspace } from "@/components/event-workspace"
import { formatMoney } from "@/lib/money"
import { paymentStatusLabel, progressStatusLabel } from "@/lib/order-status"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

const pageSize = 20
type PaymentStatus =
  | "not_submitted"
  | "pending_review"
  | "confirmed"
  | "rejected"
type Progress =
  | "pending"
  | "preparing"
  | "ready_for_pickup"
  | "dispatched"
  | "fulfilled"
  | "cancelled"
type OrderListEntry = {
  _id: Id<"orders">
  reference: string
  guestName: string
  totalMinor: number
  currency: string
  paymentStatus: PaymentStatus
  progress: Progress
}
export function OrganizerOrders() {
  const event = useEventWorkspace()
  const [search, setSearch] = useState("")
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>()
  const [progress, setProgress] = useState<Progress>()
  const [itemId, setItemId] = useState<Id<"items">>()
  const [fulfillmentOptionId, setFulfillmentOptionId] =
    useState<Id<"fulfillmentOptions">>()
  const [fulfillmentType, setFulfillmentType] = useState<
    "pickup" | "delivery"
  >()
  const [cursor, setCursor] = useState<string | null>(null)
  const [previous, setPrevious] = useState<(string | null)[]>([])
  const filters = {
    eventId: event._id,
    search: search || undefined,
    paymentStatus,
    progress,
    itemId,
    fulfillmentOptionId,
    fulfillmentType,
    paginationOpts: { numItems: pageSize, cursor },
  }
  const result = useQuery(api.organizerOrders.list, filters)
  const orders = (result?.page ?? []) as OrderListEntry[]
  const items = useQuery(api.items.listForOwner, { eventId: event._id })
  const options = event.fulfillmentOptions
  const query = new URLSearchParams()
  if (search) query.set("search", search)
  if (paymentStatus) query.set("paymentStatus", paymentStatus)
  if (progress) query.set("progress", progress)
  if (itemId) query.set("itemId", itemId)
  if (fulfillmentOptionId) query.set("fulfillmentOptionId", fulfillmentOptionId)
  if (fulfillmentType) query.set("fulfillmentType", fulfillmentType)
  const controls = (prefix: string) => (
    <>
      <div className="grid min-w-44 gap-2">
        <Label htmlFor={`${prefix}-search`} className="text-base">
          Search orders
        </Label>
        <Input
          id={`${prefix}-search`}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setCursor(null)
            setPrevious([])
          }}
          placeholder="Reference or guest"
          className="min-h-12 text-base"
        />
      </div>
      <div className="grid min-w-44 gap-2">
        <Label id={`${prefix}-payment`} className="text-base">
          Payment status
        </Label>
        <Select
          value={paymentStatus}
          onValueChange={(value) => {
            setPaymentStatus(
              !value || (value as string) === "all"
                ? undefined
                : (value as PaymentStatus)
            )
            setCursor(null)
            setPrevious([])
          }}
        >
          <SelectTrigger
            aria-labelledby={`${prefix}-payment`}
            className="min-h-12 text-base"
          >
            <SelectValue placeholder="All payment statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment statuses</SelectItem>
            <SelectItem value="pending_review">
              Waiting for payment check
            </SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-44 gap-2">
        <Label id={`${prefix}-item`} className="text-base">
          Item
        </Label>
        <Select
          value={itemId}
          onValueChange={(value) => {
            setItemId(
              value === "all" || !value ? undefined : (value as Id<"items">)
            )
            setCursor(null)
            setPrevious([])
          }}
        >
          <SelectTrigger
            aria-labelledby={`${prefix}-item`}
            className="min-h-12 text-base"
          >
            <SelectValue placeholder="All items" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All items</SelectItem>
            {items?.map((item) => (
              <SelectItem key={item._id} value={item._id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-44 gap-2">
        <Label id={`${prefix}-type`} className="text-base">
          Pickup or delivery
        </Label>
        <Select
          value={fulfillmentType}
          onValueChange={(value) => {
            setFulfillmentType(
              !value || (value as string) === "all"
                ? undefined
                : (value as "pickup" | "delivery")
            )
            setCursor(null)
            setPrevious([])
          }}
        >
          <SelectTrigger
            aria-labelledby={`${prefix}-type`}
            className="min-h-12 text-base"
          >
            <SelectValue placeholder="All options" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All options</SelectItem>
            <SelectItem value="pickup">Pickup</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-44 gap-2">
        <Label id={`${prefix}-option`} className="text-base">
          Fulfillment option
        </Label>
        <Select
          value={fulfillmentOptionId}
          onValueChange={(value) => {
            setFulfillmentOptionId(
              value === "all" || !value
                ? undefined
                : (value as Id<"fulfillmentOptions">)
            )
            setCursor(null)
            setPrevious([])
          }}
        >
          <SelectTrigger
            aria-labelledby={`${prefix}-option`}
            className="min-h-12 text-base"
          >
            <SelectValue placeholder="All fulfillment options" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fulfillment options</SelectItem>
            {options?.map((option) => (
              <SelectItem key={option._id} value={option._id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-44 gap-2">
        <Label id={`${prefix}-progress`} className="text-base">
          Order progress
        </Label>
        <Select
          value={progress}
          onValueChange={(value) => {
            setProgress(
              !value || (value as string) === "all"
                ? undefined
                : (value as Progress)
            )
            setCursor(null)
            setPrevious([])
          }}
        >
          <SelectTrigger
            aria-labelledby={`${prefix}-progress`}
            className="min-h-12 text-base"
          >
            <SelectValue placeholder="All progress" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All progress</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="preparing">Preparing</SelectItem>
            <SelectItem value="ready_for_pickup">Ready for pickup</SelectItem>
            <SelectItem value="dispatched">Sent for delivery</SelectItem>
            <SelectItem value="fulfilled">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  )
  return (
    <section className="space-y-5" aria-label="Orders">
      <div className="flex flex-wrap gap-3">
        <div className="hidden flex-1 flex-wrap gap-3 xl:flex">
          {controls("desktop")}
        </div>
        <Sheet>
          <SheetTrigger
            render={<Button variant="outline" className="min-h-12 xl:hidden" />}
          >
            <FilterIcon aria-hidden="true" />
            Filters
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filter orders</SheetTitle>
            </SheetHeader>
            <div className="mt-6 grid gap-4">{controls("mobile")}</div>
          </SheetContent>
        </Sheet>
        <Button
          nativeButton={false}
          render={<a href={`/api/events/${event._id}/orders.csv?${query}`} />}
          className="min-h-12"
        >
          <DownloadIcon aria-hidden="true" />
          Download spreadsheet (CSV)
        </Button>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table className="[&_td]:text-base [&_th]:text-base">
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order._id}>
                <TableCell>{order.reference}</TableCell>
                <TableCell>{order.guestName}</TableCell>
                <TableCell>{paymentStatusLabel(order.paymentStatus)}</TableCell>
                <TableCell>{progressStatusLabel(order.progress)}</TableCell>
                <TableCell>
                  {formatMoney(
                    order.totalMinor,
                    order.currency || event.currency
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    nativeButton={false}
                    variant="outline"
                    className="min-h-11 text-base"
                    render={
                      <Link href={`/events/${event._id}/orders/${order._id}`} />
                    }
                  >
                    View order
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid gap-3 md:hidden">
        {orders.map((order) => (
          <Card key={order._id}>
            <CardContent className="space-y-3 pt-5 text-base">
              <p className="font-semibold">{order.reference}</p>
              <p>{order.guestName}</p>
              <p>Payment: {paymentStatusLabel(order.paymentStatus)}</p>
              <p>Progress: {progressStatusLabel(order.progress)}</p>
              <p>
                Total:{" "}
                {formatMoney(
                  order.totalMinor,
                  order.currency || event.currency
                )}
              </p>
              <Button
                nativeButton={false}
                className="min-h-12 w-full"
                render={
                  <Link href={`/events/${event._id}/orders/${order._id}`} />
                }
              >
                View order
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {result === undefined ? (
        <p className="text-base" role="status">
          Loading orders…
        </p>
      ) : result.page.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-base">
            No orders match these filters. Change a filter or try a different
            search.
          </CardContent>
        </Card>
      ) : null}
      <div className="flex justify-between gap-3">
        <Button
          variant="outline"
          className="min-h-12"
          disabled={!previous.length}
          onClick={() => {
            const next = [...previous]
            setCursor(next.pop() ?? null)
            setPrevious(next)
          }}
        >
          Previous
        </Button>
        <Button
          className="min-h-12"
          disabled={!result?.continueCursor}
          onClick={() => {
            if (!result?.continueCursor) return
            setPrevious([...previous, cursor])
            setCursor(result.continueCursor)
          }}
        >
          Next
        </Button>
      </div>
    </section>
  )
}
