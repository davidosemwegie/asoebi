"use client"

import { createContext, useContext } from "react"
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
  const event = useQuery(api.events.get, { eventId })

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

  const activeTab = pathname.endsWith("/catalog") ? "catalog" : "overview"

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
          <p className="text-sm text-pretty text-muted-foreground">
            Manage the event details and the items guests will eventually order.
          </p>
        </header>

        <Tabs value={activeTab}>
          <TabsList variant="line" aria-label="Event sections">
            <TabsTrigger
              value="overview"
              nativeButton={false}
              render={<Link href={`/events/${event._id}`} />}
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="catalog"
              nativeButton={false}
              render={<Link href={`/events/${event._id}/catalog`} />}
            >
              Catalog
            </TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab} className="pt-4">
            {children}
          </TabsContent>
        </Tabs>
      </main>
    </EventWorkspaceContext.Provider>
  )
}
