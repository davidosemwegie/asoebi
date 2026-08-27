"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LoaderCircleIcon, SparklesIcon } from "lucide-react"

import { authClient } from "@/lib/auth-client"
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
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

type AuthMode = "login" | "signup"

const authCopy = {
  login: {
    title: "Welcome back",
    description: "Sign in to continue.",
    submit: "Sign in",
    pending: "Signing in…",
    alternatePrompt: "New to Aso Circle?",
    alternateAction: "Create an account",
    alternateHref: "/signup",
  },
  signup: {
    title: "Create your account",
    description: "Start planning events with your people in one place.",
    submit: "Create account",
    pending: "Creating account…",
    alternatePrompt: "Already have an account?",
    alternateAction: "Sign in",
    alternateHref: "/login",
  },
} as const

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const copy = authCopy[mode]
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsPending(true)
    setErrorMessage(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")

    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: String(formData.get("name") ?? "").trim(),
              email,
              password,
            })
          : await authClient.signIn.email({
              email,
              password,
              rememberMe: true,
            })

      if (result.error) {
        setErrorMessage(
          result.error.message ??
            (mode === "login"
              ? "Email or password is incorrect."
              : "Could not create your account.")
        )
        return
      }

      router.replace("/")
      router.refresh()
    } catch {
      setErrorMessage("Something went wrong. Please try again.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-5">
      <div className="flex w-full max-w-md flex-col gap-7">
        <Link href="/" className="mx-auto flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-plum text-brand-powder">
            <SparklesIcon aria-hidden="true" />
          </span>
          <span className="font-display text-xl font-medium tracking-tight">
            Aso Circle
          </span>
        </Link>

        <Card className="border-border/80 bg-card/70 px-2 py-2 shadow-[0_24px_70px_-50px_rgba(50,23,39,0.55)] ring-0 sm:px-4 sm:py-4 dark:shadow-black/20">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="font-display text-3xl font-medium tracking-tight">
              <h1>{copy.title}</h1>
            </CardTitle>
            <CardDescription className="mx-auto max-w-xs leading-relaxed">
              {copy.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                {mode === "signup" ? (
                  <Field>
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Your name"
                      minLength={2}
                      required
                      disabled={isPending}
                    />
                  </Field>
                ) : null}

                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    disabled={isPending}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    minLength={8}
                    maxLength={128}
                    required
                    disabled={isPending}
                    aria-describedby={
                      mode === "signup" ? "password-description" : undefined
                    }
                  />
                  {mode === "signup" ? (
                    <FieldDescription id="password-description">
                      Use 8 to 128 characters.
                    </FieldDescription>
                  ) : null}
                </Field>

                {errorMessage ? (
                  <FieldError aria-live="polite">{errorMessage}</FieldError>
                ) : null}

                <Field>
                  <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? (
                      <LoaderCircleIcon
                        data-icon="inline-start"
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    {isPending ? copy.pending : copy.submit}
                  </Button>
                  <FieldDescription className="text-center">
                    {copy.alternatePrompt}{" "}
                    <Link href={copy.alternateHref}>
                      {copy.alternateAction}
                    </Link>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
