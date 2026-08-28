"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react"

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

type AuthMode = "login" | "signup"
type AuthField = "name" | "email" | "password"
type AuthFieldErrors = Partial<Record<AuthField, string>>

const controlClassName = "min-h-12 bg-card text-lg"
const actionClassName = "min-h-12 w-full px-4 text-lg"
const secondaryActionClassName =
  "inline-flex min-h-11 max-w-full items-center justify-center rounded-lg px-1 text-center text-lg whitespace-normal underline underline-offset-4 outline-none [overflow-wrap:anywhere] hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"

const authCopy = {
  login: {
    title: "Welcome back",
    description: "Sign in to continue to your Aso Circle workspace.",
    submit: "Sign in",
    pending: "Signing in…",
    alternatePrompt: "New to Aso Circle?",
    alternateAction: "Create an account",
    alternateHref: "/signup",
  },
  signup: {
    title: "Create your account",
    description: "Start planning celebrations with your people in one place.",
    submit: "Create account",
    pending: "Creating account…",
    alternatePrompt: "Already have an account?",
    alternateAction: "Sign in",
    alternateHref: "/login",
  },
} as const

function getVerificationResultHref(
  result: "sent" | "verified",
  continuation: string
) {
  const searchParams = new URLSearchParams({ [result]: "1" })
  const safeContinuation = getSafeAuthContinuation(continuation)

  if (safeContinuation !== "/") {
    searchParams.set("next", safeContinuation)
  }

  return `/verify-email?${searchParams.toString()}`
}

function validateAuthFields(mode: AuthMode, formData: FormData) {
  const errors: AuthFieldErrors = {}
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (mode === "signup" && name.length < 2) {
    errors.name = "Enter your name using at least 2 characters."
  }

  if (!email) {
    errors.email = "Enter your email address."
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address."
  }

  if (password.length < 8 || password.length > 128) {
    errors.password = "Use 8 to 128 characters."
  }

  return { errors, name, email, password }
}

export function AuthForm({
  mode,
  continuation = "/",
}: {
  mode: AuthMode
  continuation?: string
}) {
  const router = useRouter()
  const copy = authCopy[mode]
  const safeContinuation = getSafeAuthContinuation(continuation)
  const [isPending, setIsPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    const { errors, name, email, password } = validateAuthFields(
      mode,
      new FormData(event.currentTarget)
    )
    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) return

    setIsPending(true)

    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name,
              email,
              password,
              callbackURL: getVerificationResultHref(
                "verified",
                safeContinuation
              ),
            })
          : await authClient.signIn.email({
              email,
              password,
              rememberMe: true,
            })

      if (result.error) {
        setErrorMessage(
          mode === "login"
            ? "Email or password is incorrect."
            : "We couldn't create your account. Check your details or sign in if you already have an account."
        )
        return
      }

      router.replace(
        mode === "signup"
          ? getVerificationResultHref("sent", safeContinuation)
          : safeContinuation
      )
      router.refresh()
    } catch {
      setErrorMessage("Something went wrong. Please try again.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthShell title={copy.title} description={copy.description}>
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isPending}
        className="space-y-5"
      >
        <FieldGroup>
          {mode === "signup" ? (
            <Field data-invalid={Boolean(fieldErrors.name)}>
              <FieldLabel htmlFor="name" className="text-lg">
                Name
              </FieldLabel>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                className={controlClassName}
                minLength={2}
                required
                disabled={isPending}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
              />
              <FieldError id="name-error">{fieldErrors.name}</FieldError>
            </Field>
          ) : null}

          <Field data-invalid={Boolean(fieldErrors.email)}>
            <FieldLabel htmlFor="email" className="text-lg">
              Email
            </FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              className={controlClassName}
              required
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            <FieldError id="email-error">{fieldErrors.email}</FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.password)}>
            <div className="flex flex-col items-start gap-1 min-[280px]:min-h-11 min-[280px]:flex-row min-[280px]:items-center min-[280px]:justify-between min-[280px]:gap-3">
              <FieldLabel htmlFor="password" className="text-lg">
                Password
              </FieldLabel>
              {mode === "login" ? (
                <Link
                  href={getAuthHref("/forgot-password", safeContinuation)}
                  className={secondaryActionClassName}
                >
                  Forgot password?
                </Link>
              ) : null}
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              className={controlClassName}
              minLength={8}
              maxLength={128}
              required
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                [
                  mode === "signup" ? "password-description" : null,
                  fieldErrors.password ? "password-error" : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            />
            {mode === "signup" ? (
              <FieldDescription id="password-description" className="text-lg">
                Use 8 to 128 characters.
              </FieldDescription>
            ) : null}
            <FieldError id="password-error">{fieldErrors.password}</FieldError>
          </Field>

          {errorMessage ? (
            <Alert variant="destructive" aria-live="polite">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>
                {mode === "login" ? "Sign-in failed" : "Account not created"}
              </AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <Field>
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
              {isPending ? copy.pending : copy.submit}
            </Button>
            <FieldDescription className="text-center text-lg [overflow-wrap:anywhere]">
              {copy.alternatePrompt}{" "}
              <Link
                href={getAuthHref(copy.alternateHref, safeContinuation)}
                className={secondaryActionClassName}
              >
                {copy.alternateAction}
              </Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
