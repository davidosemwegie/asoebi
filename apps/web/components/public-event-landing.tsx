"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  useConvexAuth,
  useMutation,
  usePreloadedQuery,
  useQuery,
  type Preloaded,
} from "convex/react"
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  Clock3Icon,
  ContactIcon,
  LoaderCircleIcon,
  MapPinIcon,
  PackageOpenIcon,
  SparklesIcon,
} from "lucide-react"

import { formatDateValue, formatDeadline } from "@/lib/dates"
import { getAuthHref } from "@/lib/auth-continuation"
import { formatMoney } from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"

const DEFAULT_BANNER = "/images/default-event-banner.webp"

function LandingSkeleton() {
  return (
    <main className="min-h-dvh bg-muted/30" aria-busy="true">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-6 aspect-[16/7] w-full rounded-xl" />
        <Skeleton className="mt-8 h-72 w-full rounded-xl" />
      </div>
      <span className="sr-only">Loading event details</span>
    </main>
  )
}

function UnavailableEvent() {
  return (
    <main className="flex min-h-dvh items-center bg-muted/30 px-4 py-8">
      <Empty className="mx-auto min-h-80 max-w-xl border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon aria-hidden="true" />
          </EmptyMedia>
          <h1 className="font-heading text-xl font-medium">
            Event unavailable
          </h1>
          <EmptyDescription className="text-lg">
            This private event link is invalid or the event is not currently
            available. Ask the organizer for an active link.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            nativeButton={false}
            render={<Link href="/login" />}
            variant="outline"
            className="min-h-12 text-lg"
          >
            Sign in to Aso Circle
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}

export function PublicEventLanding({
  shareToken,
  serverNow,
  preloadedLanding,
}: {
  shareToken: string
  serverNow: number
  preloadedLanding: Preloaded<typeof api.sharedEvents.getLanding>
}) {
  const initialLanding = usePreloadedQuery(preloadedLanding)
  const clockOffset = useRef<number | null>(null)
  const [queryNow, setQueryNow] = useState(serverNow)
  const [deadlineReached, setDeadlineReached] = useState(
    initialLanding?.orderingOpen === false
  )
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [hasJoined, setHasJoined] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const { isAuthenticated, isLoading: authIsLoading } = useConvexAuth()
  const refreshedLanding = useQuery(
    api.sharedEvents.getLanding,
    queryNow === serverNow ? "skip" : { shareToken, now: queryNow }
  )
  const landing =
    queryNow === serverNow || refreshedLanding === undefined
      ? initialLanding
      : refreshedLanding
  const startCheckout = useMutation(api.eventAttendees.startCheckout)

  useEffect(() => {
    if (!landing?.orderingOpen) return

    const clientNow = Date.now()
    if (clockOffset.current === null) {
      clockOffset.current = serverNow - clientNow
    }
    const authoritativeNow = clientNow + clockOffset.current
    const delay = Math.max(0, landing.orderDeadlineAt - authoritativeNow)

    const timeout = window.setTimeout(
      () => {
        setDeadlineReached(true)
        setQueryNow(landing.orderDeadlineAt)
      },
      Math.min(delay, 2_147_483_647)
    )
    return () => window.clearTimeout(timeout)
  }, [landing?.orderDeadlineAt, landing?.orderingOpen, serverNow])

  if (landing === undefined) return <LandingSkeleton />
  if (landing === null) return <UnavailableEvent />

  const availableItems = landing.items.filter(
    (item) => item.availableQuantity > 0
  )
  const orderingOpen = landing.orderingOpen && !deadlineReached
  const orderDeadlineAt = landing.orderDeadlineAt
  const canStart = orderingOpen && availableItems.length > 0 && !hasJoined
  const continuation = `/e/${shareToken}`
  const coverSrc = landing.coverVersion
    ? `/e/${shareToken}/cover/v1/${landing.coverVersion}`
    : DEFAULT_BANNER

  async function handleStart() {
    if (isStarting) return
    setStartError(null)
    setIsStarting(true)
    try {
      await startCheckout({ shareToken })
      setHasJoined(true)
      setConfirmationOpen(true)
    } catch {
      const clientNow = Date.now()
      const authoritativeNow =
        clientNow + (clockOffset.current ?? serverNow - clientNow)
      if (authoritativeNow >= orderDeadlineAt) {
        setDeadlineReached(true)
      }
      setQueryNow(
        authoritativeNow === serverNow ? authoritativeNow + 1 : authoritativeNow
      )
      setStartError(
        "We couldn’t connect you to this event. It may no longer be accepting orders. Review the updated event details and try again."
      )
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <main className="min-h-dvh bg-muted/30 text-lg leading-relaxed">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="inline-flex min-h-11 items-center gap-2 font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SparklesIcon aria-hidden="true" />
          </span>
          Aso Circle
        </div>

        <div className="relative mt-6 aspect-[16/7] min-h-48 w-full overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
          <Image
            src={coverSrc}
            alt={`Event banner for ${landing.name}`}
            fill
            preload
            sizes="(max-width: 768px) 100vw, 1152px"
            className="object-cover"
          />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
          <div className="min-w-0 space-y-8">
            <header className="space-y-3">
              <Badge variant="secondary" className="text-base">
                Private event
              </Badge>
              <h1 className="min-w-0 font-heading text-4xl leading-tight font-semibold text-balance [overflow-wrap:anywhere] whitespace-pre-wrap sm:text-5xl">
                {landing.name}
              </h1>
              <p className="max-w-3xl min-w-0 text-lg text-pretty [overflow-wrap:anywhere] whitespace-pre-wrap text-muted-foreground">
                {landing.description}
              </p>
            </header>

            {!orderingOpen ? (
              <Alert className="p-4 text-lg">
                <Clock3Icon aria-hidden="true" />
                <AlertTitle className="text-lg">
                  The ordering deadline has passed
                </AlertTitle>
                <AlertDescription className="text-lg">
                  You can still review the event and items, but new orders can
                  no longer be started.
                </AlertDescription>
              </Alert>
            ) : availableItems.length === 0 ? (
              <Alert className="p-4 text-lg">
                <PackageOpenIcon aria-hidden="true" />
                <AlertTitle className="text-lg">No items available</AlertTitle>
                <AlertDescription className="text-lg">
                  The organizer does not currently have an item available to
                  order. Check back later.
                </AlertDescription>
              </Alert>
            ) : null}

            <section
              aria-labelledby="available-items-heading"
              className="space-y-4"
            >
              <div>
                <h2
                  id="available-items-heading"
                  className="font-heading text-2xl font-semibold text-balance"
                >
                  Available items
                </h2>
                <p className="mt-1 text-lg text-pretty text-muted-foreground">
                  Prices and availability are shown for each item.
                </p>
              </div>

              {landing.items.length === 0 ? (
                <Empty className="min-h-52 border bg-background">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <PackageOpenIcon aria-hidden="true" />
                    </EmptyMedia>
                    <h3 className="font-heading text-xl font-medium">
                      No items are published
                    </h3>
                    <EmptyDescription className="text-lg">
                      The organizer has not published any items for this event.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="grid list-none gap-4 sm:grid-cols-2">
                  {landing.items.map((item) => (
                    <li key={item.itemKey} className="min-w-0">
                      <Card className="h-full min-w-0 bg-background">
                        <CardHeader className="min-w-0">
                          <CardTitle className="min-w-0 text-xl [overflow-wrap:anywhere] whitespace-pre-wrap">
                            <h3>{item.name}</h3>
                          </CardTitle>
                          {item.description ? (
                            <CardDescription className="min-w-0 text-lg text-pretty [overflow-wrap:anywhere] whitespace-pre-wrap">
                              {item.description}
                            </CardDescription>
                          ) : null}
                        </CardHeader>
                        <CardContent className="space-y-2 text-lg">
                          <p className="font-semibold tabular-nums">
                            {formatMoney(item.priceMinor, landing.currency)}
                            <span className="font-normal [overflow-wrap:anywhere] whitespace-normal text-muted-foreground">
                              {` per ${item.unitLabel}`}
                            </span>
                          </p>
                          <p className="text-muted-foreground">
                            {item.availableQuantity > 0
                              ? `${item.availableQuantity} ${item.availableQuantity === 1 ? "unit" : "units"} available`
                              : "Sold out"}
                          </p>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-6">
            <Card className="bg-background">
              <CardHeader>
                <h2 className="font-heading text-xl font-medium">
                  Event details
                </h2>
              </CardHeader>
              <CardContent>
                <dl className="space-y-5 text-lg">
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
                    <CalendarDaysIcon
                      className="mt-1 size-5"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="font-medium">Event date</dt>
                      <dd className="text-pretty text-muted-foreground">
                        <time dateTime={landing.eventDate}>
                          {formatDateValue(landing.eventDate)}
                        </time>
                      </dd>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
                    <MapPinIcon className="mt-1 size-5" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="font-medium">Location</dt>
                      <dd className="text-pretty [overflow-wrap:anywhere] text-muted-foreground">
                        {landing.location}
                      </dd>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
                    <Clock3Icon className="mt-1 size-5" aria-hidden="true" />
                    <div>
                      <dt className="font-medium">Ordering deadline</dt>
                      <dd className="text-pretty text-muted-foreground">
                        <time
                          dateTime={new Date(
                            landing.orderDeadlineAt
                          ).toISOString()}
                        >
                          {formatDeadline(
                            landing.orderDeadlineAt,
                            landing.timeZone
                          )}
                        </time>
                      </dd>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
                    <ContactIcon className="mt-1 size-5" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="font-medium">Organizer</dt>
                      <dd className="text-pretty [overflow-wrap:anywhere] text-muted-foreground">
                        {landing.organizerContact}
                      </dd>
                    </div>
                  </div>
                </dl>

                {startError ? (
                  <Alert
                    variant="destructive"
                    aria-live="polite"
                    className="mt-6 p-4 text-lg"
                  >
                    <CircleAlertIcon aria-hidden="true" />
                    <AlertTitle className="text-lg">
                      Could not continue
                    </AlertTitle>
                    <AlertDescription className="text-lg">
                      {startError}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="mt-6 space-y-2">
                  {!isAuthenticated && !authIsLoading && canStart ? (
                    <Button
                      nativeButton={false}
                      render={
                        <Link href={getAuthHref("/login", continuation)} />
                      }
                      className="min-h-12 w-full px-4 text-lg"
                    >
                      Start your order
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleStart}
                      disabled={
                        !canStart ||
                        authIsLoading ||
                        !isAuthenticated ||
                        isStarting
                      }
                      className="min-h-12 w-full px-4 text-lg"
                    >
                      {isStarting || authIsLoading ? (
                        <LoaderCircleIcon
                          className="animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      ) : null}
                      {isStarting
                        ? "Connecting to the event…"
                        : hasJoined
                          ? "Connected to event"
                          : "Start your order"}
                    </Button>
                  )}
                  <p className="text-lg text-pretty text-muted-foreground">
                    {hasJoined
                      ? "Your account is linked to this event."
                      : canStart
                        ? isAuthenticated
                          ? "Your account will be linked to this event."
                          : "Sign in or create an account to continue."
                        : orderingOpen
                          ? "An available item is required to start an order."
                          : "New orders are closed for this event."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <CheckCircle2Icon aria-hidden="true" />
            </div>
            <DialogTitle className="text-xl">
              You’re connected to this event
            </DialogTitle>
            <DialogDescription className="text-lg text-pretty">
              Your account is linked to this event. No order has been submitted
              yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button className="min-h-12 text-lg" />}>
              Done
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
