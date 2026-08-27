"use client"

import { useMemo, useRef, useState, type FormEvent } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import type { FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import {
  ArchiveIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  ClipboardIcon,
  ImageIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  PackageCheckIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react"

import { useEventWorkspace } from "@/components/event-workspace"
import {
  formatDateTimeLocal,
  getBrowserTimeZone,
  getSupportedTimeZones,
  zonedDateTimeToEpoch,
} from "@/lib/dates"
import {
  formatMinorUnitsForInput,
  formatMoney,
  parsePriceToMinorUnits,
} from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

const DEFAULT_BANNER = "/images/default-event-banner.webp"
const MAX_COVER_BYTES = 10 * 1024 * 1024
const controlClassName = "min-h-12 text-base"
const actionClassName = "min-h-11 px-4 text-base"

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>
type FulfillmentOption = EventData["fulfillmentOptions"][number]
type Feedback = { type: "success" | "error"; message: string } | null

async function getSha256Base64(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  let binary = ""
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function FeedbackAlert({
  feedback,
  title,
}: {
  feedback: Feedback
  title: string
}) {
  if (!feedback) return null
  return (
    <Alert
      variant={feedback.type === "error" ? "destructive" : "default"}
      aria-live="polite"
    >
      {feedback.type === "error" ? (
        <CircleAlertIcon aria-hidden="true" />
      ) : (
        <CheckCircle2Icon aria-hidden="true" />
      )}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{feedback.message}</AlertDescription>
    </Alert>
  )
}

function EventCover() {
  const event = useEventWorkspace()
  const generateUpload = useMutation(api.eventSetup.generateCoverUploadUrl)
  const setCover = useMutation(api.eventSetup.setCover)
  const removeCover = useMutation(api.eventSetup.removeCover)
  const inputRef = useRef<HTMLInputElement>(null)
  const removeCancelRef = useRef<HTMLButtonElement>(null)
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const coverSource =
    event.coverUrl && event.coverUrl !== failedCoverUrl
      ? event.coverUrl
      : DEFAULT_BANNER

  async function handleUpload(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    if (isUploading || event.status === "archived") return
    setFeedback(null)
    const file = inputRef.current?.files?.[0]
    if (!file) {
      setFeedback({ type: "error", message: "Choose an image to upload." })
      return
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFeedback({
        type: "error",
        message: "Choose a JPEG, PNG, or WebP image.",
      })
      return
    }
    if (file.size > MAX_COVER_BYTES) {
      setFeedback({
        type: "error",
        message: "Choose an image no larger than 10 MB.",
      })
      return
    }

    setIsUploading(true)
    try {
      const { claimId, uploadUrl } = await generateUpload({
        eventId: event._id,
        contentType: file.type,
        size: file.size,
        sha256: await getSha256Base64(file),
      })
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!response.ok) throw new Error("Upload failed")
      const result: unknown = await response.json()
      if (
        typeof result !== "object" ||
        result === null ||
        !("storageId" in result) ||
        typeof result.storageId !== "string"
      ) {
        throw new Error("Upload response was invalid")
      }
      const attached = await setCover({
        eventId: event._id,
        claimId,
        storageId: result.storageId as Id<"_storage">,
      })
      if (!attached.ok) {
        setFeedback({ type: "error", message: attached.message })
      } else {
        if (inputRef.current) inputRef.current.value = ""
        setFeedback({
          type: "success",
          message: event.coverUrl
            ? "The event cover was replaced."
            : "The event cover was uploaded.",
        })
      }
    } catch {
      setFeedback({
        type: "error",
        message: "We couldn't upload that cover. Check the file and try again.",
      })
    } finally {
      setIsUploading(false)
    }
  }

  async function handleRemove() {
    setIsRemoving(true)
    setFeedback(null)
    try {
      await removeCover({ eventId: event._id })
      setRemoveOpen(false)
      setFeedback({
        type: "success",
        message:
          "The uploaded cover was removed. The standard banner is now in use.",
      })
    } catch {
      setFeedback({
        type: "error",
        message: "We couldn't remove the uploaded cover. Try again.",
      })
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Event cover</CardTitle>
        <CardDescription className="text-base">
          The standard banner is used until you upload an event image. Event
          title text stays separate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="relative aspect-[1895/830] overflow-hidden rounded-lg border bg-muted">
          <Image
            src={coverSource}
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
        <form
          onSubmit={handleUpload}
          className="space-y-4"
          aria-busy={isUploading}
        >
          <Field>
            <FieldLabel htmlFor="event-cover-file" className="text-base">
              Upload a cover image
            </FieldLabel>
            <Input
              ref={inputRef}
              id="event-cover-file"
              name="cover"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={controlClassName}
              disabled={isUploading || event.status === "archived"}
              aria-describedby="event-cover-help"
            />
            <FieldDescription id="event-cover-help" className="text-base">
              JPEG, PNG, or WebP, up to 10 MB. A wide image works best.
            </FieldDescription>
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              className={actionClassName}
              disabled={isUploading || event.status === "archived"}
            >
              {isUploading ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : event.coverUrl ? (
                <UploadIcon aria-hidden="true" />
              ) : (
                <ImageIcon aria-hidden="true" />
              )}
              {isUploading
                ? "Uploading…"
                : event.coverUrl
                  ? "Replace cover"
                  : "Upload cover"}
            </Button>
            {event.coverUrl ? (
              <Button
                type="button"
                variant="outline"
                className={actionClassName}
                onClick={() => setRemoveOpen(true)}
                disabled={isUploading || event.status === "archived"}
              >
                <Trash2Icon aria-hidden="true" /> Remove uploaded cover
              </Button>
            ) : null}
          </div>
          <FeedbackAlert feedback={feedback} title="Cover status" />
        </form>
      </CardContent>
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent initialFocus={removeCancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the uploaded cover?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              The stored image will be deleted and the standard Asoebi banner
              will appear instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              ref={removeCancelRef}
              className={actionClassName}
              disabled={isRemoving}
            >
              Keep cover
            </AlertDialogCancel>
            <AlertDialogAction
              className={actionClassName}
              onClick={handleRemove}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {isRemoving ? "Removing…" : "Remove cover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

type DetailErrors = Partial<
  Record<
    | "name"
    | "description"
    | "eventDate"
    | "deadline"
    | "timeZone"
    | "location"
    | "contact",
    string
  >
>

function getInitialDeadline(event: EventData) {
  if (event.orderDeadlineAt !== undefined && event.timeZone) {
    try {
      return formatDateTimeLocal(event.orderDeadlineAt, event.timeZone)
    } catch {
      return `${event.orderDeadline}T23:59`
    }
  }
  return `${event.orderDeadline}T23:59`
}

function EventDetailsForm() {
  const event = useEventWorkspace()
  const updateEvent = useMutation(api.events.update)
  const suggestedTimeZones = useMemo(() => getSupportedTimeZones(), [])
  const initialTimeZone = event.timeZone ?? getBrowserTimeZone()
  const [isPending, setIsPending] = useState(false)
  const [errors, setErrors] = useState<DetailErrors>({})
  const [feedback, setFeedback] = useState<Feedback>(null)
  const currencyLocked = event.hasCatalogItems

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    if (isPending || event.status === "archived") return
    setFeedback(null)
    const formData = new FormData(submitEvent.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const description = String(formData.get("description") ?? "").trim()
    const eventDate = String(formData.get("eventDate") ?? "")
    const deadline = String(formData.get("deadline") ?? "")
    const timeZone = String(formData.get("timeZone") ?? "").trim()
    const location = String(formData.get("location") ?? "").trim()
    const contact = String(formData.get("contact") ?? "").trim()
    const nextErrors: DetailErrors = {}
    if (!name) nextErrors.name = "Enter the event name."
    if (!description)
      nextErrors.description = "Enter a short event description."
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate))
      nextErrors.eventDate = "Choose the event date."
    if (!timeZone) nextErrors.timeZone = "Enter the event time zone."
    const orderDeadlineAt = zonedDateTimeToEpoch(deadline, timeZone)
    if (orderDeadlineAt === null) {
      nextErrors.deadline =
        "Choose a valid local date and time for this time zone."
    }
    if (!location)
      nextErrors.location = "Enter the event location or a location note."
    if (!contact) nextErrors.contact = "Enter organizer contact information."
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || orderDeadlineAt === null) {
      setFeedback({
        type: "error",
        message: "Review the highlighted event details.",
      })
      return
    }

    setIsPending(true)
    try {
      await updateEvent({
        eventId: event._id,
        name,
        description,
        eventDate,
        orderDeadline: deadline.slice(0, 10),
        orderDeadlineAt,
        timeZone,
        location,
        contact,
        currency: currencyLocked
          ? event.currency
          : String(formData.get("currency") ?? "NGN"),
      })
      setFeedback({
        type: "success",
        message: "Event details and ordering deadline were saved.",
      })
    } catch {
      setFeedback({
        type: "error",
        message:
          "We couldn't save these event details. Review the fields and try again.",
      })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Core details and ordering deadline
        </CardTitle>
        <CardDescription className="text-base">
          The deadline is an exact time in the event time zone. Existing
          date-only events must be confirmed here before publication.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="space-y-5"
          noValidate
          aria-busy={isPending}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="setup-name" className="text-base">
                Event name
              </FieldLabel>
              <Input
                id="setup-name"
                name="name"
                defaultValue={event.name}
                className={controlClassName}
                required
                disabled={isPending || event.status === "archived"}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "setup-name-error" : undefined}
              />
              <FieldError id="setup-name-error">{errors.name}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="setup-description" className="text-base">
                Description
              </FieldLabel>
              <Textarea
                id="setup-description"
                name="description"
                defaultValue={event.description}
                rows={4}
                className="min-h-28 text-base"
                required
                disabled={isPending || event.status === "archived"}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={
                  errors.description ? "setup-description-error" : undefined
                }
              />
              <FieldError id="setup-description-error">
                {errors.description}
              </FieldError>
            </Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field data-invalid={Boolean(errors.eventDate)}>
                <FieldLabel htmlFor="setup-event-date" className="text-base">
                  Event date
                </FieldLabel>
                <Input
                  id="setup-event-date"
                  name="eventDate"
                  type="date"
                  defaultValue={event.eventDate}
                  className={controlClassName}
                  required
                  disabled={isPending || event.status === "archived"}
                  aria-invalid={Boolean(errors.eventDate)}
                  aria-describedby={
                    errors.eventDate ? "setup-event-date-error" : undefined
                  }
                />
                <FieldError id="setup-event-date-error">
                  {errors.eventDate}
                </FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.deadline)}>
                <FieldLabel htmlFor="setup-deadline" className="text-base">
                  Exact ordering deadline
                </FieldLabel>
                <Input
                  id="setup-deadline"
                  name="deadline"
                  type="datetime-local"
                  defaultValue={getInitialDeadline(event)}
                  className={controlClassName}
                  required
                  disabled={isPending || event.status === "archived"}
                  aria-invalid={Boolean(errors.deadline)}
                  aria-describedby="setup-deadline-help setup-deadline-error"
                />
                <FieldDescription
                  id="setup-deadline-help"
                  className="text-base"
                >
                  Guests cannot place or edit orders after this local event
                  time.
                </FieldDescription>
                <FieldError id="setup-deadline-error">
                  {errors.deadline}
                </FieldError>
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.timeZone)}>
              <FieldLabel htmlFor="setup-time-zone" className="text-base">
                Event time zone
              </FieldLabel>
              <Input
                id="setup-time-zone"
                name="timeZone"
                list="iana-time-zones"
                defaultValue={initialTimeZone}
                className={controlClassName}
                required
                disabled={isPending || event.status === "archived"}
                aria-invalid={Boolean(errors.timeZone)}
                aria-describedby="setup-time-zone-help setup-time-zone-error"
                autoComplete="off"
              />
              <datalist id="iana-time-zones">
                {suggestedTimeZones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <FieldDescription id="setup-time-zone-help" className="text-base">
                Use an IANA name such as Africa/Lagos, Europe/London, or
                America/Toronto.
              </FieldDescription>
              <FieldError id="setup-time-zone-error">
                {errors.timeZone}
              </FieldError>
            </Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field data-invalid={Boolean(errors.location)}>
                <FieldLabel htmlFor="setup-location" className="text-base">
                  Location or location note
                </FieldLabel>
                <Input
                  id="setup-location"
                  name="location"
                  defaultValue={event.location}
                  className={controlClassName}
                  required
                  disabled={isPending || event.status === "archived"}
                  aria-invalid={Boolean(errors.location)}
                  aria-describedby={
                    errors.location ? "setup-location-error" : undefined
                  }
                />
                <FieldError id="setup-location-error">
                  {errors.location}
                </FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.contact)}>
                <FieldLabel htmlFor="setup-contact" className="text-base">
                  Organizer contact
                </FieldLabel>
                <Input
                  id="setup-contact"
                  name="contact"
                  defaultValue={event.contact}
                  className={controlClassName}
                  required
                  disabled={isPending || event.status === "archived"}
                  aria-invalid={Boolean(errors.contact)}
                  aria-describedby={
                    errors.contact ? "setup-contact-error" : undefined
                  }
                />
                <FieldError id="setup-contact-error">
                  {errors.contact}
                </FieldError>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="setup-currency" className="text-base">
                Currency
              </FieldLabel>
              <select
                id="setup-currency"
                name="currency"
                defaultValue={event.currency}
                disabled={
                  isPending || currencyLocked || event.status === "archived"
                }
                className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="NGN">NGN — Nigerian naira</option>
                <option value="USD">USD — US dollar</option>
                <option value="GBP">GBP — British pound</option>
                <option value="CAD">CAD — Canadian dollar</option>
              </select>
              <FieldDescription className="text-base">
                {currencyLocked
                  ? "Currency is locked because this event has items."
                  : "All event prices and fees use this currency."}
              </FieldDescription>
            </Field>
          </FieldGroup>
          <FeedbackAlert feedback={feedback} title="Event details status" />
          <Button
            type="submit"
            className="min-h-12 px-5 text-base"
            disabled={isPending || event.status === "archived"}
          >
            {isPending ? (
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            ) : (
              <SaveIcon aria-hidden="true" />
            )}
            {isPending ? "Saving…" : "Save event details"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function PaymentInstructions() {
  const event = useEventWorkspace()
  const saveInstructions = useMutation(api.eventSetup.savePaymentInstructions)
  const removeInstructions = useMutation(
    api.eventSetup.removePaymentInstructions
  )
  const [isPending, setIsPending] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [instructionsError, setInstructionsError] = useState<string | null>(
    null
  )

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    if (isPending || event.status === "archived") return
    const instructions = String(
      new FormData(submitEvent.currentTarget).get("instructions") ?? ""
    ).trim()
    if (!instructions) {
      setInstructionsError("Enter external payment instructions.")
      setFeedback({
        type: "error",
        message: "Review the highlighted payment instructions.",
      })
      return
    }
    setInstructionsError(null)
    setIsPending(true)
    setFeedback(null)
    try {
      await saveInstructions({ eventId: event._id, instructions })
      setFeedback({
        type: "success",
        message: "Payment instructions were saved.",
      })
    } catch {
      setFeedback({
        type: "error",
        message: "We couldn't save the payment instructions. Try again.",
      })
    } finally {
      setIsPending(false)
    }
  }

  async function handleRemove() {
    setIsPending(true)
    setFeedback(null)
    try {
      await removeInstructions({ eventId: event._id })
      setFeedback({
        type: "success",
        message: "Payment instructions were removed.",
      })
    } catch {
      setFeedback({
        type: "error",
        message: "We couldn't remove the payment instructions.",
      })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Payment instructions</CardTitle>
        <CardDescription className="text-base">
          Explain how guests should pay outside Asoebi. These instructions are
          event-specific.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          aria-busy={isPending}
          noValidate
        >
          <Field data-invalid={Boolean(instructionsError)}>
            <FieldLabel htmlFor="payment-instructions" className="text-base">
              External payment guidance
            </FieldLabel>
            <Textarea
              key={event.paymentInstructions ?? "no-payment-instructions"}
              id="payment-instructions"
              name="instructions"
              defaultValue={event.paymentInstructions ?? ""}
              rows={6}
              maxLength={4000}
              className="min-h-36 text-base"
              required
              disabled={isPending || event.status === "archived"}
              aria-invalid={Boolean(instructionsError)}
              aria-describedby="payment-instructions-help payment-instructions-error"
            />
            <FieldDescription
              id="payment-instructions-help"
              className="text-base"
            >
              Include the account or transfer details and the reference guests
              should use. Do not include information that should appear in
              public messages.
            </FieldDescription>
            <FieldError id="payment-instructions-error">
              {instructionsError}
            </FieldError>
          </Field>
          <FeedbackAlert
            feedback={feedback}
            title="Payment instructions status"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              className={actionClassName}
              disabled={isPending || event.status === "archived"}
            >
              {isPending ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : (
                <SaveIcon aria-hidden="true" />
              )}
              {isPending ? "Saving…" : "Save instructions"}
            </Button>
            {event.paymentInstructions ? (
              <Button
                type="button"
                variant="outline"
                className={actionClassName}
                onClick={handleRemove}
                disabled={isPending || event.status === "archived"}
              >
                <Trash2Icon aria-hidden="true" /> Remove instructions
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function CheckboxField({
  name,
  defaultChecked,
  children,
}: {
  name: string
  defaultChecked: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-base focus-within:ring-3 focus-within:ring-ring/50">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-5 accent-primary"
      />
      <span>{children}</span>
    </label>
  )
}

function FulfillmentEditor({
  option,
  onDone,
}: {
  option: FulfillmentOption | null
  onDone: (message?: string) => void
}) {
  const event = useEventWorkspace()
  const createOption = useMutation(api.eventSetup.createFulfillmentOption)
  const updateOption = useMutation(api.eventSetup.updateFulfillmentOption)
  const [type, setType] = useState<"pickup" | "delivery">(
    option?.type ?? "pickup"
  )
  const [isPending, setIsPending] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [errors, setErrors] = useState<
    Partial<Record<"name" | "fee" | "instructions", string>>
  >({})

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    if (isPending) return
    const formData = new FormData(submitEvent.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const instructions = String(formData.get("instructions") ?? "").trim()
    const feeMinor = parsePriceToMinorUnits(String(formData.get("fee") ?? ""))
    const nextErrors: typeof errors = {}
    if (!name) nextErrors.name = "Enter the option name."
    if (!instructions)
      nextErrors.instructions = "Enter pickup or delivery instructions."
    if (feeMinor === null)
      nextErrors.fee = "Enter a valid non-negative flat fee, such as 0.00."
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || feeMinor === null) {
      setFeedback({
        type: "error",
        message: "Review the highlighted fulfillment details.",
      })
      return
    }
    const values = {
      name,
      type,
      feeMinor,
      instructions,
      enabled: formData.get("enabled") === "on",
      requiredFields:
        type === "pickup"
          ? {
              kind: "pickup" as const,
              pickupContact: formData.get("pickupContact") === "on",
            }
          : {
              kind: "delivery" as const,
              recipientName: formData.get("recipientName") === "on",
              phoneNumber: formData.get("phoneNumber") === "on",
              address: formData.get("address") === "on",
              availability: formData.get("availability") === "on",
              notes: formData.get("notes") === "on",
            },
    }
    setIsPending(true)
    setFeedback(null)
    try {
      if (option) await updateOption({ optionId: option._id, ...values })
      else await createOption({ eventId: event._id, ...values })
      onDone(
        option ? "Fulfillment option updated." : "Fulfillment option added."
      )
    } catch {
      setFeedback({
        type: "error",
        message:
          "We couldn't save this fulfillment option. Review the fields and try again.",
      })
    } finally {
      setIsPending(false)
    }
  }

  const deliveryFields =
    option?.requiredFields.kind === "delivery" ? option.requiredFields : null
  const pickupFields =
    option?.requiredFields.kind === "pickup" ? option.requiredFields : null

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border p-4"
      aria-busy={isPending}
      noValidate
    >
      <h3 className="font-heading text-lg font-medium">
        {option ? `Edit ${option.name}` : "Add a fulfillment option"}
      </h3>
      <div className="grid gap-5 md:grid-cols-2">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="fulfillment-name" className="text-base">
            Option name
          </FieldLabel>
          <Input
            id="fulfillment-name"
            name="name"
            defaultValue={option?.name ?? ""}
            placeholder="Family home pickup"
            className={controlClassName}
            required
            maxLength={80}
            disabled={isPending}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={
              errors.name ? "fulfillment-name-error" : undefined
            }
          />
          <FieldError id="fulfillment-name-error">{errors.name}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="fulfillment-type" className="text-base">
            Type
          </FieldLabel>
          <select
            id="fulfillment-type"
            name="type"
            value={type}
            onChange={(changeEvent) =>
              setType(changeEvent.target.value as "pickup" | "delivery")
            }
            className="min-h-12 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            disabled={isPending}
          >
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </select>
        </Field>
      </div>
      <Field data-invalid={Boolean(errors.fee)}>
        <FieldLabel htmlFor="fulfillment-fee" className="text-base">
          Flat fee ({event.currency})
        </FieldLabel>
        <Input
          id="fulfillment-fee"
          name="fee"
          inputMode="decimal"
          defaultValue={formatMinorUnitsForInput(option?.feeMinor ?? 0)}
          className={controlClassName}
          required
          disabled={isPending}
          aria-invalid={Boolean(errors.fee)}
          aria-describedby="fulfillment-fee-help fulfillment-fee-error"
        />
        <FieldDescription id="fulfillment-fee-help" className="text-base">
          This fee is added once per order. Use 0.00 for no fee.
        </FieldDescription>
        <FieldError id="fulfillment-fee-error">{errors.fee}</FieldError>
      </Field>
      <Field data-invalid={Boolean(errors.instructions)}>
        <FieldLabel htmlFor="fulfillment-instructions" className="text-base">
          Instructions
        </FieldLabel>
        <Textarea
          id="fulfillment-instructions"
          name="instructions"
          defaultValue={option?.instructions ?? ""}
          rows={4}
          maxLength={1000}
          className="min-h-28 text-base"
          required
          disabled={isPending}
          aria-invalid={Boolean(errors.instructions)}
          aria-describedby={
            errors.instructions ? "fulfillment-instructions-error" : undefined
          }
        />
        <FieldError id="fulfillment-instructions-error">
          {errors.instructions}
        </FieldError>
      </Field>
      <FieldSet>
        <FieldLegend>Required guest information</FieldLegend>
        <div className="grid gap-2 md:grid-cols-2">
          {type === "pickup" ? (
            <CheckboxField
              name="pickupContact"
              defaultChecked={pickupFields?.pickupContact ?? true}
            >
              Pickup contact name
            </CheckboxField>
          ) : (
            <>
              <CheckboxField
                name="recipientName"
                defaultChecked={deliveryFields?.recipientName ?? true}
              >
                Recipient name
              </CheckboxField>
              <CheckboxField
                name="phoneNumber"
                defaultChecked={deliveryFields?.phoneNumber ?? true}
              >
                Phone number
              </CheckboxField>
              <CheckboxField
                name="address"
                defaultChecked={deliveryFields?.address ?? true}
              >
                Delivery address
              </CheckboxField>
              <CheckboxField
                name="availability"
                defaultChecked={deliveryFields?.availability ?? false}
              >
                Delivery availability
              </CheckboxField>
              <CheckboxField
                name="notes"
                defaultChecked={deliveryFields?.notes ?? false}
              >
                Delivery notes
              </CheckboxField>
            </>
          )}
        </div>
      </FieldSet>
      <CheckboxField name="enabled" defaultChecked={option?.enabled ?? true}>
        Enable this option for guests
      </CheckboxField>
      <FeedbackAlert feedback={feedback} title="Fulfillment option status" />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className={actionClassName} disabled={isPending}>
          {isPending ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          ) : (
            <SaveIcon aria-hidden="true" />
          )}
          {isPending ? "Saving…" : option ? "Save option" : "Add option"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={actionClassName}
          onClick={() => onDone()}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function FulfillmentOptions() {
  const event = useEventWorkspace()
  const setEnabled = useMutation(api.eventSetup.setFulfillmentOptionEnabled)
  const removeOption = useMutation(api.eventSetup.removeFulfillmentOption)
  const [editingId, setEditingId] = useState<
    Id<"fulfillmentOptions"> | "new" | null
  >(null)
  const [removing, setRemoving] = useState<FulfillmentOption | null>(null)
  const [pendingId, setPendingId] = useState<Id<"fulfillmentOptions"> | null>(
    null
  )
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function toggleOption(option: FulfillmentOption) {
    setPendingId(option._id)
    setFeedback(null)
    try {
      await setEnabled({ optionId: option._id, enabled: !option.enabled })
      setFeedback({
        type: "success",
        message: `${option.name} is now ${option.enabled ? "disabled" : "enabled"}.`,
      })
    } catch {
      setFeedback({
        type: "error",
        message: "We couldn't change that option. Try again.",
      })
    } finally {
      setPendingId(null)
    }
  }

  async function confirmRemove() {
    if (!removing) return
    setPendingId(removing._id)
    try {
      await removeOption({ optionId: removing._id })
      setFeedback({ type: "success", message: `${removing.name} was removed.` })
      setRemoving(null)
    } catch {
      setFeedback({ type: "error", message: "We couldn't remove that option." })
    } finally {
      setPendingId(null)
    }
  }

  const editingOption =
    editingId && editingId !== "new"
      ? (event.fulfillmentOptions.find((option) => option._id === editingId) ??
        null)
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Fulfillment options</CardTitle>
        <CardDescription className="text-base">
          Offer named pickup or delivery choices with a flat event-currency fee
          and only the guest details each choice needs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {event.fulfillmentOptions.length === 0 ? (
          <Alert>
            <PackageCheckIcon aria-hidden="true" />
            <AlertTitle>No fulfillment options yet</AlertTitle>
            <AlertDescription>
              Add and enable at least one option before publishing.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {event.fulfillmentOptions.map((option) => (
              <div
                key={option._id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-base font-medium">
                      {option.name}
                    </h3>
                    <Badge variant={option.enabled ? "secondary" : "outline"}>
                      {option.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {option.type}
                    </Badge>
                  </div>
                  <p className="text-base text-muted-foreground">
                    {formatMoney(option.feeMinor, event.currency)} flat fee
                  </p>
                  <p className="text-base whitespace-pre-wrap text-muted-foreground">
                    {option.instructions}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={actionClassName}
                    onClick={() => setEditingId(option._id)}
                    disabled={pendingId !== null || event.status === "archived"}
                  >
                    <PencilIcon aria-hidden="true" /> Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={actionClassName}
                    onClick={() => toggleOption(option)}
                    disabled={pendingId !== null || event.status === "archived"}
                  >
                    {pendingId === option._id ? (
                      <LoaderCircleIcon
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    ) : option.enabled ? (
                      <XCircleIcon aria-hidden="true" />
                    ) : (
                      <CheckCircle2Icon aria-hidden="true" />
                    )}
                    {option.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className={actionClassName}
                    onClick={() => setRemoving(option)}
                    disabled={pendingId !== null || event.status === "archived"}
                  >
                    <Trash2Icon aria-hidden="true" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <FeedbackAlert feedback={feedback} title="Fulfillment status" />
        {editingId ? (
          <FulfillmentEditor
            key={editingId}
            option={editingOption}
            onDone={(message) => {
              setEditingId(null)
              if (message) setFeedback({ type: "success", message })
            }}
          />
        ) : (
          <Button
            type="button"
            className={actionClassName}
            onClick={() => setEditingId("new")}
            disabled={
              event.status === "archived" ||
              event.fulfillmentOptions.length >= 20
            }
          >
            <PlusIcon aria-hidden="true" /> Add fulfillment option
          </Button>
        )}
      </CardContent>
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open && pendingId === null) setRemoving(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Guests will no longer be able to choose this option. Existing
              orders are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className={actionClassName}
              disabled={pendingId !== null}
            >
              Keep option
            </AlertDialogCancel>
            <AlertDialogAction
              className={actionClassName}
              onClick={confirmRemove}
              disabled={pendingId !== null}
            >
              {pendingId ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {pendingId ? "Removing…" : "Remove option"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

type LifecycleAction = "close" | "reopen" | "archive" | "delete"

function PublishAndLifecycle() {
  const router = useRouter()
  const event = useEventWorkspace()
  const ensureShareToken = useMutation(api.events.ensureShareToken)
  const publishEvent = useMutation(api.events.publish)
  const closeEvent = useMutation(api.events.close)
  const reopenEvent = useMutation(api.events.reopen)
  const archiveEvent = useMutation(api.events.archive)
  const removeEvent = useMutation(api.events.remove)
  const [pending, setPending] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<LifecycleAction | null>(
    null
  )
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [manualLink, setManualLink] = useState<string | null>(null)

  async function createPrivateLink() {
    setPending("token")
    setFeedback(null)
    try {
      await ensureShareToken({ eventId: event._id })
      setFeedback({
        type: "success",
        message: "The private event link is ready.",
      })
    } catch {
      setFeedback({
        type: "error",
        message: "We couldn't create the private link. Try again.",
      })
    } finally {
      setPending(null)
    }
  }

  async function publish() {
    setPending("publish")
    setFeedback(null)
    try {
      await publishEvent({ eventId: event._id })
      setFeedback({
        type: "success",
        message: "The event is published. You can now copy its private link.",
      })
    } catch {
      setFeedback({
        type: "error",
        message:
          "The event was not published. Complete every readiness item and try again.",
      })
    } finally {
      setPending(null)
    }
  }

  async function copyLink() {
    if (!event.shareToken) return
    setPending("copy")
    setFeedback(null)
    const absoluteLink = `${window.location.origin}/e/${event.shareToken}`
    try {
      await navigator.clipboard.writeText(absoluteLink)
      setManualLink(null)
      setFeedback({
        type: "success",
        message: "The private event link was copied.",
      })
    } catch {
      setManualLink(absoluteLink)
      setFeedback({
        type: "error",
        message:
          "We couldn't copy the link automatically. The full link is shown so you can select and copy it manually.",
      })
    } finally {
      setPending(null)
    }
  }

  async function runConfirmedAction() {
    if (!confirmAction) return
    setPending(confirmAction)
    setFeedback(null)
    try {
      if (confirmAction === "close") await closeEvent({ eventId: event._id })
      if (confirmAction === "reopen") await reopenEvent({ eventId: event._id })
      if (confirmAction === "archive")
        await archiveEvent({ eventId: event._id })
      if (confirmAction === "delete") {
        await removeEvent({ eventId: event._id })
        router.replace("/")
        return
      }
      setFeedback({
        type: "success",
        message: `The event was ${confirmAction === "close" ? "closed" : confirmAction === "reopen" ? "reopened" : "archived"}.`,
      })
      setConfirmAction(null)
    } catch {
      setFeedback({
        type: "error",
        message: `We couldn't ${confirmAction} this event. Review its current state and try again.`,
      })
    } finally {
      setPending(null)
    }
  }

  const link = event.shareToken ? `/e/${event.shareToken}` : null
  const showLink = link && ["published", "closed"].includes(event.status)
  const actionCopy =
    confirmAction === "close"
      ? {
          title: "Close this event?",
          description:
            "New orders and guest edits will stop immediately. Existing orders remain available.",
          label: "Close event",
        }
      : confirmAction === "reopen"
        ? {
            title: "Reopen this event?",
            description:
              "Ordering will resume only if every publish-readiness requirement is still met.",
            label: "Reopen event",
          }
        : confirmAction === "archive"
          ? {
              title: "Archive this event?",
              description:
                "The event will become read-only and leave the active event list. Its retained records are not deleted.",
              label: "Archive event",
            }
          : {
              title: "Delete this draft event?",
              description:
                "The draft, its items, setup records, and uploaded cover will be permanently deleted.",
              label: "Delete draft",
            }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Publish readiness and lifecycle
        </CardTitle>
        <CardDescription className="text-base">
          Every item below must be complete before a draft can be published or a
          closed event can be reopened.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="space-y-3" aria-label="Publish readiness checklist">
          {event.publishReadiness.missingRequirements.length === 0 ? (
            <li className="flex gap-3 text-base">
              <CheckCircle2Icon
                className="mt-0.5 size-5 text-emerald-700"
                aria-hidden="true"
              />
              <span>All publish requirements are complete.</span>
            </li>
          ) : (
            event.publishReadiness.missingRequirements.map((requirement) => (
              <li key={requirement.code} className="flex gap-3 text-base">
                <CircleAlertIcon
                  className="mt-0.5 size-5 text-amber-700"
                  aria-hidden="true"
                />
                <span>{requirement.message}</span>
              </li>
            ))
          )}
        </ul>
        {!event.shareToken && event.status !== "archived" ? (
          <Button
            type="button"
            variant="outline"
            className={actionClassName}
            onClick={createPrivateLink}
            disabled={pending !== null}
          >
            <LockKeyholeIcon aria-hidden="true" />
            {pending === "token" ? "Creating link…" : "Create private link"}
          </Button>
        ) : null}
        {showLink ? (
          <Field>
            <FieldLabel htmlFor="private-event-link" className="text-base">
              Private event link
            </FieldLabel>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="private-event-link"
                readOnly
                value={manualLink ?? link}
                className={`${controlClassName} font-mono`}
              />
              <Button
                type="button"
                className={actionClassName}
                onClick={copyLink}
                disabled={pending !== null}
              >
                <ClipboardIcon aria-hidden="true" />
                {pending === "copy" ? "Copying…" : "Copy link"}
              </Button>
            </div>
            <FieldDescription className="text-base">
              Share this normal private link directly. Invitations do not create
              separate access links.
            </FieldDescription>
          </Field>
        ) : null}
        <FeedbackAlert feedback={feedback} title="Event status" />
        <div
          className="flex flex-wrap gap-3"
          aria-describedby="publish-readiness-help"
        >
          {event.status === "draft" ? (
            <>
              <Button
                type="button"
                className="min-h-12 px-5 text-base"
                onClick={publish}
                disabled={pending !== null || !event.publishReadiness.isReady}
              >
                <SendIcon aria-hidden="true" />
                {pending === "publish" ? "Publishing…" : "Publish event"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className={actionClassName}
                onClick={() => setConfirmAction("delete")}
                disabled={pending !== null}
              >
                <Trash2Icon aria-hidden="true" /> Delete draft
              </Button>
            </>
          ) : event.status === "published" ? (
            <>
              <Button
                type="button"
                variant="outline"
                className={actionClassName}
                onClick={() => setConfirmAction("close")}
                disabled={pending !== null}
              >
                <XCircleIcon aria-hidden="true" /> Close ordering
              </Button>
              <Button
                type="button"
                variant="outline"
                className={actionClassName}
                onClick={() => setConfirmAction("archive")}
                disabled={pending !== null}
              >
                <ArchiveIcon aria-hidden="true" /> Archive event
              </Button>
            </>
          ) : event.status === "closed" ? (
            <>
              <Button
                type="button"
                className={actionClassName}
                onClick={() => setConfirmAction("reopen")}
                disabled={pending !== null || !event.publishReadiness.isReady}
              >
                <RotateCcwIcon aria-hidden="true" /> Reopen ordering
              </Button>
              <Button
                type="button"
                variant="outline"
                className={actionClassName}
                onClick={() => setConfirmAction("archive")}
                disabled={pending !== null}
              >
                <ArchiveIcon aria-hidden="true" /> Archive event
              </Button>
            </>
          ) : (
            <p className="text-base text-muted-foreground">
              This archived event is read-only.
            </p>
          )}
        </div>
        <p
          id="publish-readiness-help"
          className="text-base text-muted-foreground"
        >
          Disabled publish or reopen actions become available when the checklist
          is complete.
        </p>
      </CardContent>
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open && pending === null) setConfirmAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionCopy.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {actionCopy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className={actionClassName}
              disabled={pending !== null}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirmAction === "delete" ? "destructive" : "default"}
              className={actionClassName}
              onClick={runConfirmedAction}
              disabled={pending !== null}
            >
              {pending ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {pending ? "Working…" : actionCopy.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function EventSetup() {
  return (
    <section
      className="space-y-6 text-base"
      aria-labelledby="event-setup-heading"
    >
      <div className="space-y-2">
        <h2
          id="event-setup-heading"
          className="font-heading text-2xl font-semibold"
        >
          Event setup
        </h2>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          Complete the details guests rely on, then review every readiness item
          before publishing.
        </p>
      </div>
      <EventCover />
      <EventDetailsForm />
      <PaymentInstructions />
      <FulfillmentOptions />
      <PublishAndLifecycle />
    </section>
  )
}
