"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  LoaderCircleIcon,
} from "lucide-react"

import { AuthShell } from "@/components/auth-shell"
import { authClient } from "@/lib/auth-client"
import { getAuthHref, getSafeAuthContinuation } from "@/lib/auth-continuation"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

type PasswordField = "password" | "confirmation"
type PasswordErrors = Partial<Record<PasswordField, string>>

const controlClassName = "min-h-12 text-base"
const actionClassName = "min-h-12 w-full px-4 text-base"
const linkClassName =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-base underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"

export function ResetPasswordForm({
  token,
  invalidLink,
  continuation = "/",
}: {
  token?: string
  invalidLink: boolean
  continuation?: string
}) {
  const safeContinuation = getSafeAuthContinuation(continuation)
  const [isPending, setIsPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<PasswordErrors>({})
  const [resetFailed, setResetFailed] = useState(false)
  const [resetComplete, setResetComplete] = useState(false)
  const [tokenInvalid, setTokenInvalid] = useState(invalidLink || !token)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResetFailed(false)

    const formData = new FormData(event.currentTarget)
    const password = String(formData.get("password") ?? "")
    const confirmation = String(formData.get("confirmation") ?? "")
    const errors: PasswordErrors = {}

    if (password.length < 8 || password.length > 128) {
      errors.password = "Use 8 to 128 characters."
    }

    if (!confirmation) {
      errors.confirmation = "Enter the new password again."
    } else if (confirmation !== password) {
      errors.confirmation = "The passwords do not match."
    }

    setFieldErrors(errors)

    if (Object.keys(errors).length > 0 || !token) {
      return
    }

    setIsPending(true)

    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      })

      if (result.error) {
        setTokenInvalid(true)
        return
      }

      setResetComplete(true)
    } catch {
      setResetFailed(true)
    } finally {
      setIsPending(false)
    }
  }

  if (resetComplete) {
    return (
      <AuthShell
        title="Password updated"
        description="Your new password is ready to use."
      >
        <div className="space-y-5">
          <Alert aria-live="polite">
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Password updated</AlertTitle>
            <AlertDescription className="text-base">
              Sign in with your new password to continue.
            </AlertDescription>
          </Alert>
          <Link
            href={getAuthHref("/login", safeContinuation)}
            className={linkClassName}
          >
            Sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  if (tokenInvalid) {
    return (
      <AuthShell
        title="Reset link unavailable"
        description="This password-reset link is invalid or has expired."
      >
        <div className="space-y-5">
          <Alert variant="destructive" aria-live="polite">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Request a new link</AlertTitle>
            <AlertDescription className="text-base">
              Password-reset links can only be used once and expire for your
              security.
            </AlertDescription>
          </Alert>
          <Link
            href={getAuthHref("/forgot-password", safeContinuation)}
            className={linkClassName}
          >
            Request a new reset link
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Use a password that you do not use for another account."
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isPending}
        className="space-y-5"
      >
        <FieldGroup>
          <Field data-invalid={Boolean(fieldErrors.password)}>
            <FieldLabel htmlFor="new-password" className="text-base">
              New password
            </FieldLabel>
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              className={controlClassName}
              minLength={8}
              maxLength={128}
              required
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={[
                "new-password-description",
                fieldErrors.password ? "new-password-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            />
            <FieldDescription
              id="new-password-description"
              className="text-base"
            >
              Use 8 to 128 characters.
            </FieldDescription>
            <FieldError id="new-password-error">
              {fieldErrors.password}
            </FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.confirmation)}>
            <FieldLabel htmlFor="confirm-password" className="text-base">
              Confirm new password
            </FieldLabel>
            <Input
              id="confirm-password"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              className={controlClassName}
              minLength={8}
              maxLength={128}
              required
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.confirmation)}
              aria-describedby={
                fieldErrors.confirmation ? "confirm-password-error" : undefined
              }
            />
            <FieldError id="confirm-password-error">
              {fieldErrors.confirmation}
            </FieldError>
          </Field>

          {resetFailed ? (
            <Alert variant="destructive" aria-live="polite">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Password not updated</AlertTitle>
              <AlertDescription className="text-base">
                We couldn’t update your password. Check your connection and try
                again.
              </AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            className={actionClassName}
            disabled={isPending}
          >
            {isPending ? (
              <LoaderCircleIcon
                data-icon="inline-start"
                className="animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {isPending ? "Updating password…" : "Update password"}
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
