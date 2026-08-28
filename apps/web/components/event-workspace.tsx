"use client"

import { createContext, useContext, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { FunctionReturnType } from "convex/server"
import { useQuery } from "convex/react"
import { SearchXIcon } from "lucide-react"

import { api } from "@workspace/backend/convex/_generated/api"
import { Badge } from "@workspace/ui/components/badge"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>

const EventWorkspaceContext = createContext<EventData | null>(null)

export function useEventWorkspace() {
  const event = useContext(EventWorkspaceContext)
  if (!event) {
    throw new Error("useEventWorkspace must be used inside EventWorkspace")
  }
  return event
}

export function EventWorkspace({
  children,
  eventId,
}: {
  children: React.ReactNode
  eventId: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [queryNow, setQueryNow] = useState(Date.now)
  const event = useQuery(api.events.get, { eventId, now: queryNow })

  useEffect(() => {
    const interval = window.setInterval(() => setQueryNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  if (event === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8 md:py-12">
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </main>
    )
  }

  if (event === null) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col py-8 md:py-12">
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Event not found</EmptyTitle>
            <EmptyDescription>
              This event does not exist, or you do not have access to it.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/" />}>
              Return home
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    )
  }

  const activeTab = pathname.endsWith("/catalog")
    ? "items"
    : pathname.includes("/guests")
      ? "guests"
      : pathname.includes("/orders")
        ? "orders"
        : pathname.endsWith("/setup")
          ? "setup"
          : "overview"
  const sections = [
    { value: "overview", label: "Overview", href: `/events/${event._id}` },
    { value: "items", label: "Items", href: `/events/${event._id}/catalog` },
    { value: "guests", label: "Guests", href: `/events/${event._id}/guests` },
    { value: "orders", label: "Orders", href: `/events/${event._id}/orders` },
    {
      value: "setup",
      label: "Event setup",
      href: `/events/${event._id}/setup`,
    },
  ] as const

  return (
    <EventWorkspaceContext.Provider value={event}>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8 md:py-12">
        <header className="space-y-3 border-b border-border/80 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl leading-tight font-medium tracking-tight text-balance sm:text-4xl">
              {event.name}
            </h1>
            <Badge variant="secondary" className="capitalize">
              {event.status}
            </Badge>
            <Badge variant="outline">{event.currency}</Badge>
          </div>
          <p className="text-base text-pretty text-muted-foreground">
            Manage event setup, items, guests, and orders in one place.
          </p>
        </header>

        <Tabs value={activeTab}>
          <div className="pb-1 md:hidden">
            <label
              id="event-section-label"
              htmlFor="event-section-select"
              className="mb-2 block text-base font-medium"
            >
              Event section
            </label>
            <Select
              value={activeTab}
              onValueChange={(value) => {
                const section = sections.find((item) => item.value === value)
                if (section) router.push(section.href)
              }}
            >
              <SelectTrigger
                id="event-section-select"
                aria-labelledby="event-section-label"
                className="min-h-12 w-full text-base"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectItem
                    key={section.value}
                    value={section.value}
                    className="min-h-11 text-base"
                  >
                    {section.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden pb-1 md:block">
            <TabsList
              variant="line"
              aria-label="Event sections"
              className="h-auto min-h-11 w-full flex-wrap justify-start gap-y-2"
            >
              <TabsTrigger
                value="overview"
                nativeButton={false}
                render={<Link href={`/events/${event._id}`} />}
                className="min-h-11 px-3 text-base"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="items"
                nativeButton={false}
                render={<Link href={`/events/${event._id}/catalog`} />}
                className="min-h-11 px-3 text-base"
              >
                Items
              </TabsTrigger>
              <TabsTrigger
                value="guests"
                nativeButton={false}
                render={<Link href={`/events/${event._id}/guests`} />}
                className="min-h-11 px-3 text-base"
              >
                Guests
              </TabsTrigger>
              <TabsTrigger
                value="orders"
                nativeButton={false}
                render={<Link href={`/events/${event._id}/orders`} />}
                className="min-h-11 px-3 text-base"
              >
                Orders
              </TabsTrigger>
              <TabsTrigger
                value="setup"
                nativeButton={false}
                render={<Link href={`/events/${event._id}/setup`} />}
                className="min-h-11 px-3 text-base"
              >
                Event setup
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={activeTab} className="pt-4">
            {children}
          </TabsContent>
        </Tabs>
      </main>
    </EventWorkspaceContext.Provider>
  )
}
