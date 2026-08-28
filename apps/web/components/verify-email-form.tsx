"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  LoaderCircleIcon,
  MailIcon,
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
  FieldTitle,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

const controlClassName = "min-h-12 text-lg"
const actionClassName = "min-h-12 w-full px-4 text-lg"
const linkClassName =
  "inline-flex min-h-11 max-w-full items-center justify-center rounded-lg px-1 text-center text-lg whitespace-normal underline underline-offset-4 outline-none [overflow-wrap:anywhere] hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"

function getVerificationCallbackHref(continuation: string) {
  const searchParams = new URLSearchParams({ verified: "1" })
  const safeContinuation = getSafeAuthContinuation(continuation)

  if (safeContinuation !== "/") {
    searchParams.set("next", safeContinuation)
  }

  return `/verify-email?${searchParams.toString()}`
}

export function VerifyEmailForm({
  verificationFailed,
  verificationComplete,
  emailSent,
  continuation = "/",
}: {
  verificationFailed: boolean
  verificationComplete: boolean
  emailSent: boolean
  continuation?: string
}) {
  const safeContinuation = getSafeAuthContinuation(continuation)
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const sessionEmail = session?.user.email ?? ""
  const emailIsVerified = session?.user.emailVerified ?? false
  const showVerified = emailIsVerified
  const [isPending, setIsPending] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [resendFailed, setResendFailed] = useState(false)
  const [resendComplete, setResendComplete] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEmailError(null)
    setResendFailed(false)

    const enteredEmail = String(
      new FormData(event.currentTarget).get("email") ?? ""
    ).trim()
    const email = sessionEmail || enteredEmail

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
      const callbackPath = getVerificationCallbackHref(safeContinuation)
      await authClient.sendVerificationEmail({
        email,
        callbackURL: new URL(callbackPath, window.location.origin).toString(),
      })
      setResendComplete(true)
    } catch {
      setResendFailed(true)
    } finally {
      setIsPending(false)
    }
  }

  if (showVerified) {
    const continueHref = session
      ? safeContinuation
      : getAuthHref("/login", safeContinuation)

    return (
      <AuthShell
        title="Email verified"
        description="Your email address is confirmed."
      >
        <div className="space-y-5">
          <Alert aria-live="polite">
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Email verified</AlertTitle>
            <AlertDescription className="text-lg">
              You can continue using Aso Circle.
            </AlertDescription>
          </Alert>
          {sessionPending ? (
            <Button className={actionClassName} disabled>
              Checking your session…
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={<Link href={continueHref} />}
              className={actionClassName}
            >
              Continue
            </Button>
          )}
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Verify your email"
      description="Use the link in the verification email to confirm your address. You can still sign in before verification."
    >
      <div className="space-y-5">
        {verificationFailed ? (
          <Alert variant="destructive" aria-live="polite">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Verification link unavailable</AlertTitle>
            <AlertDescription className="text-lg">
              This verification link is invalid or has expired. Request a new
              one below.
            </AlertDescription>
          </Alert>
        ) : verificationComplete ? (
          <Alert aria-live="polite">
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Verification link accepted</AlertTitle>
            <AlertDescription className="text-lg">
              Sign in to refresh your account and continue using Aso Circle.
            </AlertDescription>
          </Alert>
        ) : emailSent ? (
          <Alert aria-live="polite">
            <MailIcon aria-hidden="true" />
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription className="text-lg">
              We sent a verification link. It may take a few minutes to arrive.
            </AlertDescription>
          </Alert>
        ) : null}

        {resendComplete ? (
          <Alert aria-live="polite">
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Verification requested</AlertTitle>
            <AlertDescription className="text-lg">
              If that address still needs verification, we sent a new link.
            </AlertDescription>
          </Alert>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            aria-busy={isPending || sessionPending}
            className="space-y-5"
          >
            <FieldGroup>
              {sessionEmail ? (
                <Field>
                  <FieldTitle className="text-lg">Email</FieldTitle>
                  <FieldDescription className="text-lg text-foreground">
                    We’ll send the link to {sessionEmail}.
                  </FieldDescription>
                </Field>
              ) : (
                <Field data-invalid={Boolean(emailError)}>
                  <FieldLabel htmlFor="verification-email" className="text-lg">
                    Email
                  </FieldLabel>
                  <Input
                    id="verification-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className={controlClassName}
                    required
                    disabled={isPending || sessionPending}
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={
                      emailError ? "verification-email-error" : undefined
                    }
                  />
                  <FieldError id="verification-email-error">
                    {emailError}
                  </FieldError>
                </Field>
              )}

              {resendFailed ? (
                <Alert variant="destructive" aria-live="polite">
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertTitle>Verification not requested</AlertTitle>
                  <AlertDescription className="text-lg">
                    We couldn’t submit your request. Check your connection and
                    try again.
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                className={actionClassName}
                disabled={isPending || sessionPending}
              >
                {isPending ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {isPending ? "Requesting a new link…" : "Send a new link"}
              </Button>
            </FieldGroup>
          </form>
        )}

        {session ? (
          <div className="space-y-2">
            <Button
              nativeButton={false}
              render={<Link href={safeContinuation} />}
              variant="outline"
              className={actionClassName}
            >
              Continue for now
            </Button>
            <p className="text-lg text-pretty text-muted-foreground">
              You can start an order before verification. You’ll need to verify
              your email before submitting it later.
            </p>
          </div>
        ) : (
          <Link
            href={getAuthHref("/login", safeContinuation)}
            className={linkClassName}
          >
            Go to sign in
          </Link>
        )}
      </div>
    </AuthShell>
  )
}
