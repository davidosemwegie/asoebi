"use client"

import { useState, type FormEvent, type RefObject } from "react"
import type { FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import {
  CalendarDaysIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
} from "lucide-react"

import { fromDateValue, toDateValue } from "@/lib/dates"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { SheetFooter } from "@workspace/ui/components/sheet"
import { Textarea } from "@workspace/ui/components/textarea"

export type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>

type EventFormProps = {
  nameInputRef: RefObject<HTMLInputElement | null>
  onCancel: () => void
  onPendingChange: (pending: boolean) => void
  onSuccess: (eventId: Id<"events">) => void
} & ({ mode: "create"; event?: never } | { mode: "edit"; event: EventData })

export function EventForm({
  event,
  mode,
  nameInputRef,
  onCancel,
  onPendingChange,
  onSuccess,
}: EventFormProps) {
  const createEvent = useMutation(api.events.create)
  const updateEvent = useMutation(api.events.update)
  const [eventDate, setEventDate] = useState<Date | undefined>(() =>
    event ? fromDateValue(event.eventDate) : undefined
  )
  const [orderDeadline, setOrderDeadline] = useState<Date | undefined>(() =>
    event ? fromDateValue(event.orderDeadline) : undefined
  )
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const currencyLocked = mode === "edit" && event.hasCatalogItems
  const todayValue = toDateValue(new Date())

  function setPending(pending: boolean) {
    setIsPending(pending)
    onPendingChange(pending)
  }

  function disablesPastDate(date: Date, originalValue?: string) {
    const value = toDateValue(date)
    return value < todayValue && value !== originalValue
  }

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    if (isPending) return

    setErrorMessage(null)
    if (!eventDate || !orderDeadline) {
      setErrorMessage("Choose both an event date and an ordering deadline.")
      return
    }

    const formData = new FormData(submitEvent.currentTarget)
    const values = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      eventDate: toDateValue(eventDate),
      orderDeadline: toDateValue(orderDeadline),
      location: String(formData.get("location") ?? ""),
      contact: String(formData.get("contact") ?? ""),
      currency: currencyLocked
        ? event.currency
        : String(formData.get("currency") ?? "NGN"),
    }

    setPending(true)
    try {
      if (mode === "edit") {
        await updateEvent({ eventId: event._id, ...values })
        setPending(false)
        onSuccess(event._id)
      } else {
        const eventId = await createEvent(values)
        setPending(false)
        onSuccess(eventId)
      }
    } catch {
      setErrorMessage(
        mode === "edit"
          ? "We couldn't save these event changes. Check the details and try again."
          : "We couldn't create this event. Check the details and try again."
      )
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="event-editor-name">Event name</FieldLabel>
            <Input
              ref={nameInputRef}
              id="event-editor-name"
              name="name"
              defaultValue={event?.name ?? ""}
              placeholder="Tomi & Dami's wedding"
              required
              disabled={isPending}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="event-editor-description">
              Description
            </FieldLabel>
            <Textarea
              id="event-editor-description"
              name="description"
              defaultValue={event?.description ?? ""}
              rows={4}
              required
              disabled={isPending}
              placeholder="Tell guests what you're celebrating and what to expect."
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="event-editor-location">Location</FieldLabel>
              <Input
                id="event-editor-location"
                name="location"
                defaultValue={event?.location ?? ""}
                placeholder="Lagos, Nigeria"
                required
                disabled={isPending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="event-editor-contact">
                Organizer contact
              </FieldLabel>
              <Input
                id="event-editor-contact"
                name="contact"
                defaultValue={event?.contact ?? ""}
                placeholder="Email or phone number"
                required
                disabled={isPending}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="event-editor-currency">Currency</FieldLabel>
            <select
              id="event-editor-currency"
              name="currency"
              defaultValue={event?.currency ?? "NGN"}
              disabled={isPending || currencyLocked}
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="NGN">NGN — Nigerian naira</option>
              <option value="USD">USD — US dollar</option>
              <option value="GBP">GBP — British pound</option>
              <option value="CAD">CAD — Canadian dollar</option>
            </select>
            <FieldDescription>
              {currencyLocked
                ? "Currency is locked because this event already has catalog items."
                : "All items for this event will use this currency."}
            </FieldDescription>
          </Field>

          <div className="flex items-center gap-2">
            <CalendarDaysIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="font-heading font-medium text-balance">
              Important dates
            </h3>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldTitle>Event date</FieldTitle>
              <div className="w-fit max-w-full rounded-xl ring-1 ring-foreground/10">
                <Calendar
                  aria-label="Event date"
                  mode="single"
                  selected={eventDate}
                  onSelect={setEventDate}
                  disabled={(date) => disablesPastDate(date, event?.eventDate)}
                />
              </div>
            </Field>
            <Field>
              <FieldTitle>Ordering deadline</FieldTitle>
              <FieldDescription>
                Guests cannot place or edit orders after this date.
              </FieldDescription>
              <div className="w-fit max-w-full rounded-xl ring-1 ring-foreground/10">
                <Calendar
                  aria-label="Ordering deadline"
                  mode="single"
                  selected={orderDeadline}
                  onSelect={setOrderDeadline}
                  disabled={(date) =>
                    disablesPastDate(date, event?.orderDeadline)
                  }
                />
              </div>
            </Field>
          </div>

          {errorMessage ? (
            <Alert variant="destructive" aria-live="polite">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>
                {mode === "edit" ? "Event not saved" : "Event not created"}
              </AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </div>

      <SheetFooter className="border-t pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          ) : null}
          {isPending
            ? "Saving…"
            : mode === "edit"
              ? "Save changes"
              : "Create draft event"}
        </Button>
      </SheetFooter>
    </form>
  )
}
