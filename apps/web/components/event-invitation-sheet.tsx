"use client"

import { useRef, useState, type FormEvent } from "react"
import { useMutation } from "convex/react"
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react"

import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

export type InvitationEditorInvitation = {
  _id: Id<"eventInvitations">
  email: string
  name: string
}

type FieldErrors = { email?: string; name?: string }

const controlClassName = "min-h-12 text-base"
const actionClassName = "min-h-12 px-4 text-base"
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EventInvitationSheet({
  eventId,
  getReturnFocus,
  invitation,
  onOpenChange,
  open,
}: {
  eventId: Id<"events">
  getReturnFocus: () => HTMLElement | null
  invitation: InvitationEditorInvitation | null
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const addInvitation = useMutation(api.eventInvitations.add)
  const updateInvitation = useMutation(api.eventInvitations.update)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isPending, setIsPending] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isPending) return
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const email = String(formData.get("email") ?? "").trim()
    const nextFieldErrors: FieldErrors = {}

    if (!name) nextFieldErrors.name = "Enter the guest's name."
    if (!email) nextFieldErrors.email = "Enter the guest's email address."
    else if (!EMAIL_PATTERN.test(email)) {
      nextFieldErrors.email = "Enter a valid email address."
    }
    setFieldErrors(nextFieldErrors)
    setSubmitError(null)
    if (Object.keys(nextFieldErrors).length > 0) return

    setIsPending(true)
    try {
      if (invitation) {
        await updateInvitation({ invitationId: invitation._id, name, email })
      } else {
        await addInvitation({ eventId, name, email })
      }
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : ""
      if (message.includes("email")) {
        setFieldErrors({
          email:
            "This email address is already on the guest list or is not valid.",
        })
      } else if (message.includes("name")) {
        setFieldErrors({ name: "Enter a guest name of up to 120 characters." })
      } else {
        setSubmitError(
          invitation
            ? "We couldn't save these guest changes. Check the details and try again."
            : "We couldn't add this guest. Check the details and try again."
        )
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full text-base sm:max-w-lg"
        showCloseButton={!isPending}
        initialFocus={nameInputRef}
        finalFocus={getReturnFocus}
      >
        <SheetHeader>
          <SheetTitle className="text-xl">
            {invitation ? "Edit guest invitation" : "Add guest invitation"}
          </SheetTitle>
          <SheetDescription className="text-base">
            {invitation
              ? "Correct a guest's details. Updating an email keeps earlier email history and prepares a new invitation to send."
              : "Save the guest first, then choose when to send the private event link."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            <FieldGroup>
              <Field data-invalid={Boolean(fieldErrors.name)}>
                <FieldLabel htmlFor="invitation-name">Name</FieldLabel>
                <Input
                  ref={nameInputRef}
                  id="invitation-name"
                  name="name"
                  defaultValue={invitation?.name ?? ""}
                  maxLength={120}
                  autoComplete="name"
                  aria-describedby={
                    fieldErrors.name ? "invitation-name-error" : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.name)}
                  className={controlClassName}
                  disabled={isPending}
                  required
                />
                <FieldError id="invitation-name-error">
                  {fieldErrors.name}
                </FieldError>
              </Field>
              <Field data-invalid={Boolean(fieldErrors.email)}>
                <FieldLabel htmlFor="invitation-email">
                  Email address
                </FieldLabel>
                <Input
                  id="invitation-email"
                  name="email"
                  type="email"
                  defaultValue={invitation?.email ?? ""}
                  maxLength={254}
                  autoComplete="email"
                  aria-describedby={
                    fieldErrors.email ? "invitation-email-error" : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={controlClassName}
                  disabled={isPending}
                  required
                />
                <FieldError id="invitation-email-error">
                  {fieldErrors.email}
                </FieldError>
              </Field>
              {submitError ? (
                <Alert variant="destructive" className="text-base">
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertTitle>Guest not saved</AlertTitle>
                  <AlertDescription className="text-base">
                    {submitError}
                  </AlertDescription>
                </Alert>
              ) : null}
            </FieldGroup>
          </div>
          <SheetFooter className="border-t">
            <Button
              type="button"
              variant="outline"
              className={actionClassName}
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className={actionClassName}
              disabled={isPending}
            >
              {isPending ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {isPending
                ? "Saving…"
                : invitation
                  ? "Save changes"
                  : "Add guest"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
