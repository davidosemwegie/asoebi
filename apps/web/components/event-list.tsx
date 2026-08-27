"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { CalendarDaysIcon, PlusIcon } from "lucide-react"

import { formatDateValue } from "@/lib/dates"
import { api } from "@workspace/backend/convex/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"

export function EventList({
  onCreate,
}: {
  onCreate: (trigger: HTMLElement) => void
}) {
  const events = useQuery(api.events.listMine)

  if (events === undefined)
    return <Skeleton className="h-52 w-full rounded-xl" />

  if (events.length === 0) {
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDaysIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No events yet</EmptyTitle>
          <EmptyDescription>
            Create your first event and start planning the guest ordering
            experience.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            type="button"
            onClick={(event) => onCreate(event.currentTarget)}
          >
            <PlusIcon aria-hidden="true" /> Create event
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <Link
          key={event._id}
          href={`/events/${event._id}`}
          className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="h-full transition-colors hover:bg-muted/30">
            <CardHeader>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="capitalize">{event.status}</span>
                <span>{event.currency}</span>
              </div>
              <CardTitle>{event.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{formatDateValue(event.eventDate)}</p>
              <p>{event.location}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
