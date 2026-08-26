"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import {
  CalendarDaysIcon,
  Clock3Icon,
  MapPinIcon,
  UserRoundIcon,
} from "lucide-react"

import { formatDateValue } from "@/lib/dates"
import { api } from "@workspace/backend/convex/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

export function EventDetails({ eventId }: { eventId: string }) {
  const event = useQuery(api.events.get, { eventId })

  if (event === undefined) {
    return <Skeleton className="h-80 w-full rounded-xl" />
  }

  if (event === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Event not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            This event does not exist, or you do not have access to it.
          </p>
          <Button render={<Link href="/" />}>Return home</Button>
        </CardContent>
      </Card>
    )
  }

  const details = [
    {
      label: "Event date",
      value: formatDateValue(event.eventDate),
      icon: CalendarDaysIcon,
    },
    {
      label: "Order deadline",
      value: formatDateValue(event.orderDeadline),
      icon: Clock3Icon,
    },
    { label: "Location", value: event.location, icon: MapPinIcon },
    { label: "Organizer contact", value: event.contact, icon: UserRoundIcon },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader>
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
              {event.status}
            </span>
            <span className="text-xs text-muted-foreground">
              {event.currency}
            </span>
          </div>
          <CardTitle>
            <h1 className="text-2xl">{event.name}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-7 whitespace-pre-wrap text-muted-foreground">
            {event.description}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-5">
            {details.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex gap-3">
                <Icon
                  className="mt-0.5 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-medium">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
