"use client"

import { createContext, useContext, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
  const [queryNow, setQueryNow] = useState(Date.now)
  const event = useQuery(api.events.get, { eventId, now: queryNow })

  useEffect(() => {
    const interval = window.setInterval(() => setQueryNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  if (event === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-4">
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
      <main className="mx-auto flex w-full max-w-6xl flex-col py-4">
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
    : pathname.endsWith("/setup")
      ? "setup"
      : "overview"

  return (
    <EventWorkspaceContext.Provider value={event}>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold text-balance">
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
          <div className="pb-1">
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
                disabled
                className="min-h-11 px-3 text-base"
              >
                Guests <span className="text-base">Coming soon</span>
              </TabsTrigger>
              <TabsTrigger
                value="orders"
                disabled
                className="min-h-11 px-3 text-base"
              >
                Orders <span className="text-base">Coming soon</span>
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
