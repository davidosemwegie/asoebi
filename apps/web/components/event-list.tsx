"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  MapPinIcon,
  PlusIcon,
} from "lucide-react"

import { formatDateValue } from "@/lib/dates"
import { api } from "@workspace/backend/convex/_generated/api"
import { Button } from "@workspace/ui/components/button"
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
      <Empty className="min-h-80 border border-border/80 bg-card/45">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="size-11 rounded-full bg-brand-powder/45 text-brand-aubergine dark:bg-brand-powder/15 dark:text-brand-powder [&_svg:not([class*='size-'])]:size-5"
          >
            <CalendarDaysIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="font-display text-2xl font-medium">
            Your first event starts here
          </EmptyTitle>
          <EmptyDescription>
            Create an event and begin shaping a thoughtful guest ordering
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
    <section
      className="overflow-hidden rounded-2xl border border-border/80 bg-card/65"
      aria-label="Your events"
    >
      <div className="flex items-center justify-between border-b border-border/80 px-5 py-4 sm:px-6">
        <h2 className="text-xs font-semibold tracking-[0.16em] uppercase">
          Your events
        </h2>
        <span className="text-xs text-muted-foreground">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>
      <div className="divide-y divide-border/80">
        {events.map((event) => (
          <Link
            key={event._id}
            href={`/events/${event._id}`}
            className="group grid gap-4 p-5 transition-colors outline-none hover:bg-brand-powder/10 focus-visible:bg-brand-powder/15 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-6 sm:py-5"
          >
            <span className="flex size-11 items-center justify-center rounded-xl border border-brand-periwinkle/35 bg-brand-powder/30 text-brand-aubergine dark:bg-brand-powder/10 dark:text-brand-powder">
              <CalendarDaysIcon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate font-display text-xl font-medium tracking-tight sm:text-2xl">
                  {event.name}
                </span>
                <span className="rounded-full border border-border/80 bg-background/45 px-2 py-0.5 text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {event.status}
                </span>
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{formatDateValue(event.eventDate)}</span>
                <span className="inline-flex items-center gap-1">
                  <MapPinIcon className="size-3.5" aria-hidden="true" />
                  {event.location}
                </span>
              </span>
            </span>
            <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground sm:justify-end">
              <span>{event.currency}</span>
              <ArrowUpRightIcon
                className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
