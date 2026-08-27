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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

const controlClassName = "min-h-12 text-base"
const actionClassName = "min-h-12 w-full px-4 text-base"
const linkClassName =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-base underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"

export function ForgotPasswordForm({
  continuation = "/",
}: {
  continuation?: string
}) {
  const safeContinuation = getSafeAuthContinuation(continuation)
  const [isPending, setIsPending] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [requestFailed, setRequestFailed] = useState(false)
  const [requestComplete, setRequestComplete] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEmailError(null)
    setRequestFailed(false)

    const email = String(
      new FormData(event.currentTarget).get("email") ?? ""
    ).trim()

    if (!email) {
      setEmailError("Enter your email address.")
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address.")
      return
    }

    setIsPending(true)

    try {
      const resetPath = getAuthHref("/reset-password", safeContinuation)
      await authClient.requestPasswordReset({
        email,
        redirectTo: new URL(resetPath, window.location.origin).toString(),
      })
      setRequestComplete(true)
    } catch {
      setRequestFailed(true)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your account email and we’ll send instructions if a matching account exists."
    >
      {requestComplete ? (
        <div className="space-y-5">
          <Alert aria-live="polite">
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription className="text-base">
              If an account uses that email address, we sent a password-reset
              link. It may take a few minutes to arrive.
            </AlertDescription>
          </Alert>
          <Link
            href={getAuthHref("/login", safeContinuation)}
            className={linkClassName}
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isPending}
          className="space-y-5"
        >
          <FieldGroup>
            <Field data-invalid={Boolean(emailError)}>
              <FieldLabel htmlFor="reset-email" className="text-base">
                Email
              </FieldLabel>
              <Input
                id="reset-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                className={controlClassName}
                required
                disabled={isPending}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "reset-email-error" : undefined}
              />
              <FieldError id="reset-email-error">{emailError}</FieldError>
            </Field>

            {requestFailed ? (
              <Alert variant="destructive" aria-live="polite">
                <CircleAlertIcon aria-hidden="true" />
                <AlertTitle>Request not sent</AlertTitle>
                <AlertDescription className="text-base">
                  We couldn’t submit your request. Check your connection and try
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
              {isPending ? "Sending instructions…" : "Send reset instructions"}
            </Button>
            <Link
              href={getAuthHref("/login", safeContinuation)}
              className={linkClassName}
            >
              Return to sign in
            </Link>
          </FieldGroup>
        </form>
      )}
    </AuthShell>
  )
}
