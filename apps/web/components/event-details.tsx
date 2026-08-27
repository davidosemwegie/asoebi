"use client"

import {
  CalendarDaysIcon,
  Clock3Icon,
  MapPinIcon,
  UserRoundIcon,
} from "lucide-react"

import { formatDateValue } from "@/lib/dates"
import { useEventWorkspace } from "@/components/event-workspace"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function EventDetails() {
  const event = useEventWorkspace()

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
          <CardTitle>About this event</CardTitle>
          <CardDescription>
            The description organizers use to identify this celebration.
          </CardDescription>
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
