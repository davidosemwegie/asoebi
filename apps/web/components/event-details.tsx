"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import {
  CalendarDaysIcon,
  CircleAlertIcon,
  Clock3Icon,
  Settings2Icon,
  LoaderCircleIcon,
  MapPinIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react"

import { formatDateValue, formatDeadline } from "@/lib/dates"
import { useEventWorkspace } from "@/components/event-workspace"
import { api } from "@workspace/backend/convex/_generated/api"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

const DEFAULT_BANNER = "/images/default-event-banner.webp"

export function EventDetails() {
  const router = useRouter()
  const event = useEventWorkspace()
  const removeEvent = useMutation(api.events.remove)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null)
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const eventPath = `/events/${event._id}`

  function handleDeleteOpenChange(open: boolean) {
    if (!open && isDeleting) return
    setDeleteOpen(open)
    if (open) setDeleteError(null)
  }

  async function handleDelete() {
    if (isDeleting) return

    setDeleteError(null)
    setIsDeleting(true)
    try {
      await removeEvent({ eventId: event._id })
      setIsDeleting(false)
      setDeleteOpen(false)
      router.replace("/")
    } catch {
      setDeleteError("We couldn't delete this draft event. Try again.")
      setIsDeleting(false)
    }
  }

  const details = [
    {
      label: "Event date",
      value: formatDateValue(event.eventDate),
      icon: CalendarDaysIcon,
    },
    {
      label: "Order deadline",
      value:
        event.orderDeadlineAt !== undefined && event.timeZone
          ? formatDeadline(event.orderDeadlineAt, event.timeZone)
          : `${formatDateValue(event.orderDeadline)} (date only — finish setup)`,
      icon: Clock3Icon,
    },
    { label: "Location", value: event.location, icon: MapPinIcon },
    { label: "Organizer contact", value: event.contact, icon: UserRoundIcon },
  ]

  return (
    <section className="space-y-6" aria-label="Event overview">
      <div className="relative aspect-[1895/830] overflow-hidden rounded-xl border bg-muted">
        <Image
          src={
            event.coverUrl && event.coverUrl !== failedCoverUrl
              ? event.coverUrl
              : DEFAULT_BANNER
          }
          alt={`${event.name} event cover`}
          fill
          sizes="(max-width: 768px) 100vw, 1100px"
          className="object-cover"
          onError={() => {
            if (event.coverUrl) setFailedCoverUrl(event.coverUrl)
          }}
          priority
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href={`${eventPath}/setup`} />}
          className="min-h-11 px-4 text-base"
        >
          <Settings2Icon aria-hidden="true" /> Open event setup
        </Button>
        {event.status === "draft" ? (
          <Button
            ref={deleteButtonRef}
            type="button"
            variant="destructive"
            className="min-h-11 px-4 text-base"
            onClick={() => handleDeleteOpenChange(true)}
          >
            <Trash2Icon aria-hidden="true" /> Delete event
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>About this event</CardTitle>
            <CardDescription className="text-base">
              The description organizers use to identify this celebration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-base leading-7 text-pretty whitespace-pre-wrap text-muted-foreground">
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
                    className="mt-0.5 size-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="text-base text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-base font-medium">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent
          initialFocus={cancelDeleteButtonRef}
          finalFocus={deleteButtonRef}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {event.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              This permanently deletes the draft event and all of its catalog
              items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError ? (
            <Alert variant="destructive" className="mt-4" aria-live="polite">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Event not deleted</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              ref={cancelDeleteButtonRef}
              className="min-h-11 px-4 text-base"
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="min-h-11 px-4 text-base"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {isDeleting ? "Deleting…" : "Delete event"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
