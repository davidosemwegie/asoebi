"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { CalendarDaysIcon, LoaderCircleIcon } from "lucide-react"

import { toDateValue } from "@/lib/dates"
import { api } from "@workspace/backend/convex/_generated/api"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

export function EventForm() {
  const router = useRouter()
  const createEvent = useMutation(api.events.create)
  const [eventDate, setEventDate] = useState<Date>()
  const [orderDeadline, setOrderDeadline] = useState<Date>()
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    if (!eventDate || !orderDeadline) {
      setErrorMessage("Choose both an event date and an ordering deadline.")
      return
    }

    const formData = new FormData(event.currentTarget)
    setIsPending(true)

    try {
      const eventId = await createEvent({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        eventDate: toDateValue(eventDate),
        orderDeadline: toDateValue(orderDeadline),
        location: String(formData.get("location") ?? ""),
        contact: String(formData.get("contact") ?? ""),
        currency: String(formData.get("currency") ?? "NGN"),
      })

      router.push(`/events/${eventId}`)
    } catch {
      setErrorMessage(
        "We couldn't create this event. Check the details and try again."
      )
      setIsPending(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6 lg:grid-cols-[1fr_22rem]"
    >
      <Card>
        <CardHeader>
          <CardTitle>Event information</CardTitle>
          <CardDescription>
            Start with the details guests will use to recognize your
            celebration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Event name</FieldLabel>
              <Input
                id="name"
                name="name"
                placeholder="Tomi & Dami's wedding"
                required
                disabled={isPending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <textarea
                id="description"
                name="description"
                rows={5}
                required
                disabled={isPending}
                placeholder="Tell guests what you're celebrating and what to expect."
                className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="location">Location</FieldLabel>
                <Input
                  id="location"
                  name="location"
                  placeholder="Lagos, Nigeria"
                  required
                  disabled={isPending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contact">Organizer contact</FieldLabel>
                <Input
                  id="contact"
                  name="contact"
                  placeholder="Email or phone number"
                  required
                  disabled={isPending}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="currency">Currency</FieldLabel>
              <select
                id="currency"
                name="currency"
                defaultValue="NGN"
                disabled={isPending}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="NGN">NGN — Nigerian naira</option>
                <option value="USD">USD — US dollar</option>
                <option value="GBP">GBP — British pound</option>
                <option value="CAD">CAD — Canadian dollar</option>
              </select>
              <FieldDescription>
                All items for this event will use this currency.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDaysIcon aria-hidden="true" /> Important dates
            </CardTitle>
            <CardDescription>Select one date in each calendar.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field>
              <FieldLabel>Event date</FieldLabel>
              <div className="w-fit rounded-xl ring-1 ring-foreground/10">
                <Calendar
                  mode="single"
                  selected={eventDate}
                  onSelect={setEventDate}
                  disabled={{ before: new Date() }}
                />
              </div>
            </Field>
            <Field>
              <FieldLabel>Ordering deadline</FieldLabel>
              <FieldDescription>
                Guests cannot place or edit orders after this date.
              </FieldDescription>
              <div className="w-fit rounded-xl ring-1 ring-foreground/10">
                <Calendar
                  mode="single"
                  selected={orderDeadline}
                  onSelect={setOrderDeadline}
                  disabled={{ before: new Date() }}
                />
              </div>
            </Field>
          </CardContent>
        </Card>
        {errorMessage ? (
          <FieldError aria-live="polite">{errorMessage}</FieldError>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            ) : null}
            {isPending ? "Creating…" : "Create draft event"}
          </Button>
        </div>
      </div>
    </form>
  )
}
