"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "convex/react"
import { DownloadIcon, FilterIcon } from "lucide-react"
import { useEventWorkspace } from "@/components/event-workspace"
import { api } from "@workspace/backend/convex/_generated/api"
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
export function OrganizerOrders() {
  const event = useEventWorkspace()
  const [search, setSearch] = useState("")
  const [paymentStatus, setPaymentStatus] = useState<string>()
  const [progress, setProgress] = useState<string>()
  const [cursor, setCursor] = useState<string | null>(null)
  const [previous, setPrevious] = useState<(string | null)[]>([])
  const filters = {
    eventId: event._id,
    search: search || undefined,
    paymentStatus: paymentStatus as any,
    progress: progress as any,
    paginationOpts: { numItems: pageSize, cursor },
  }
  const result = useQuery((api as any).organizerOrders.list, filters) as any
  const query = new URLSearchParams()
  if (search) query.set("search", search)
  if (paymentStatus) query.set("paymentStatus", paymentStatus)
  if (progress) query.set("progress", progress)
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
          setPaymentStatus(value === "all" || !value ? undefined : value)
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
        value={progress}
        onValueChange={(value) => {
          setProgress(value === "all" || !value ? undefined : value)
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
            {result?.page.map((order: any) => (
              <TableRow key={order._id}>
                <TableCell>{order.reference}</TableCell>
                <TableCell>{order.guestName}</TableCell>
                <TableCell>
                  {order.paymentStatus.replaceAll("_", " ")}
                </TableCell>
                <TableCell>{order.progress.replaceAll("_", " ")}</TableCell>
                <TableCell>
                  {order.currency} {order.totalMinor.toLocaleString()}
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
        {result?.page.map((order: any) => (
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
