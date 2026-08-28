"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "convex/react"
import { DownloadIcon, FilterIcon } from "lucide-react"
import { useEventWorkspace } from "@/components/event-workspace"
import { formatMoney } from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
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
  const controls = (
    <>
      <label className="sr-only" htmlFor="order-search">
        Search orders
      </label>
      <Input
        id="order-search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setCursor(null)
          setPrevious([])
        }}
        placeholder="Search reference or guest"
        className="min-h-12 text-base"
      />
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
        <SelectTrigger className="min-h-12 text-base">
          <SelectValue placeholder="Payment status" />
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
        <SelectTrigger className="min-h-12 text-base">
          <SelectValue placeholder="Item" />
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
        <SelectTrigger className="min-h-12 text-base">
          <SelectValue placeholder="Pickup or delivery" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Pickup or delivery</SelectItem>
          <SelectItem value="pickup">Pickup</SelectItem>
          <SelectItem value="delivery">Delivery</SelectItem>
        </SelectContent>
      </Select>
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
        <SelectTrigger className="min-h-12 text-base">
          <SelectValue placeholder="Fulfillment option" />
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
        <SelectTrigger className="min-h-12 text-base">
          <SelectValue placeholder="Order progress" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All progress</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="preparing">Preparing</SelectItem>
          <SelectItem value="ready_for_pickup">Ready for pickup</SelectItem>
          <SelectItem value="dispatched">Sent for delivery</SelectItem>
          <SelectItem value="fulfilled">Completed</SelectItem>
        </SelectContent>
      </Select>
    </>
  )
  return (
    <section className="space-y-5" aria-label="Orders">
      <div className="flex flex-wrap gap-3">
        <div className="hidden flex-1 gap-3 md:flex">{controls}</div>
        <Sheet>
          <SheetTrigger
            render={<Button variant="outline" className="min-h-12 md:hidden" />}
          >
            <FilterIcon aria-hidden="true" />
            Filters
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filter orders</SheetTitle>
            </SheetHeader>
            <div className="mt-6 grid gap-4">{controls}</div>
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
        <Table>
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
                <TableCell>
                  {order.paymentStatus.replaceAll("_", " ")}
                </TableCell>
                <TableCell>{order.progress.replaceAll("_", " ")}</TableCell>
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
              <p>Payment: {order.paymentStatus.replaceAll("_", " ")}</p>
              <p>Progress: {order.progress.replaceAll("_", " ")}</p>
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
