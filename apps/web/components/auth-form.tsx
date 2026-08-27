"use client"

import { useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LoaderCircleIcon } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"

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
    <main className="min-h-svh bg-brand-blackberry text-brand-ivory">
      <div className="grid min-h-svh lg:grid-cols-[minmax(0,0.92fr)_minmax(34rem,1.08fr)]">
        <section className="flex min-h-svh flex-col px-6 py-7 sm:px-10 sm:py-9 lg:px-12 lg:py-10 xl:px-16">
          <Link href="/" className="flex w-fit items-center gap-3">
            <Image
              src="/aso-circle-icon.png"
              alt=""
              width={40}
              height={40}
              priority
              className="size-10 rounded-xl"
            />
            <span className="font-display text-xl font-medium tracking-tight">
              Aso Circle
            </span>
          </Link>

          <div className="flex flex-1 items-center py-12 lg:py-16">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 flex items-center gap-4">
                <Separator className="max-w-24 bg-brand-powder/25" />
                <p className="text-[0.65rem] font-semibold tracking-[0.22em] text-brand-powder uppercase">
                  Account / Secure
                </p>
              </div>

              <h1 className="font-display text-5xl leading-[0.95] font-medium tracking-tight text-balance sm:text-6xl">
                {copy.title}
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-6 text-brand-ivory/60">
                {copy.description}
              </p>

              <form onSubmit={handleSubmit} className="mt-10">
                <FieldGroup>
                  {mode === "signup" ? (
                    <Field>
                      <FieldLabel
                        htmlFor="name"
                        className="text-brand-ivory/90"
                      >
                        Name
                      </FieldLabel>
                      <Input
                        id="name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        placeholder="Your name"
                        minLength={2}
                        required
                        disabled={isPending}
                        className="border-brand-ivory/20 bg-brand-ivory/5 text-brand-ivory placeholder:text-brand-ivory/35 focus-visible:border-brand-powder focus-visible:ring-brand-powder/20"
                      />
                    </Field>
                  ) : null}

                  <Field>
                    <FieldLabel htmlFor="email" className="text-brand-ivory/90">
                      Email
                    </FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                      disabled={isPending}
                      className="border-brand-ivory/20 bg-brand-ivory/5 text-brand-ivory placeholder:text-brand-ivory/35 focus-visible:border-brand-powder focus-visible:ring-brand-powder/20"
                    />
                  </Field>

                  <Field>
                    <FieldLabel
                      htmlFor="password"
                      className="text-brand-ivory/90"
                    >
                      Password
                    </FieldLabel>
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
                      className="border-brand-ivory/20 bg-brand-ivory/5 text-brand-ivory focus-visible:border-brand-powder focus-visible:ring-brand-powder/20"
                    />
                    {mode === "signup" ? (
                      <FieldDescription
                        id="password-description"
                        className="text-brand-ivory/50"
                      >
                        Use 8 to 128 characters.
                      </FieldDescription>
                    ) : null}
                  </Field>

                  {errorMessage ? (
                    <FieldError aria-live="polite">{errorMessage}</FieldError>
                  ) : null}

                  <Field>
                    <Button
                      type="submit"
                      className="w-full border-brand-ivory bg-brand-ivory text-brand-blackberry hover:bg-brand-ivory/90"
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
                    <FieldDescription className="text-center text-brand-ivory/55">
                      {copy.alternatePrompt}{" "}
                      <Link
                        href={copy.alternateHref}
                        className="text-brand-ivory underline decoration-brand-powder/50 underline-offset-4 transition-colors hover:text-brand-powder"
                      >
                        {copy.alternateAction}
                      </Link>
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
            </div>
          </div>

          <div className="hidden items-center justify-between text-[0.6rem] tracking-[0.2em] text-brand-ivory/40 uppercase sm:flex">
            <span>Your people. Your style.</span>
            <span>Private workspace access</span>
          </div>
        </section>

        <aside className="hidden p-3 pl-0 lg:block">
          <div className="relative h-full min-h-[calc(100svh-1.5rem)] overflow-hidden rounded-3xl border border-brand-ivory/10">
            <Image
              src="/images/aso-oke-editorial.jpg"
              alt="A collection of handwoven Nigerian Aso Oke textiles in Aso Circle's signature colors"
              fill
              priority
              sizes="(min-width: 1024px) 55vw, 0px"
              className="object-cover"
            />
            <div
              className="absolute inset-0 bg-brand-blackberry/30"
              aria-hidden="true"
            />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-8 text-[0.65rem] tracking-[0.2em] text-brand-ivory/80 uppercase">
              <span>Handwoven / 01</span>
              <span>Aso Oke</span>
            </div>
            <div className="absolute right-8 bottom-8 left-8 max-w-xl">
              <h2 className="max-w-lg font-display text-4xl leading-[1.02] font-medium text-balance text-brand-ivory xl:text-5xl">
                Tradition, woven into every celebration.
              </h2>
              <div className="mt-6 flex items-center gap-4">
                <Separator className="max-w-10 bg-brand-powder/70" />
                <p className="max-w-sm text-xs leading-5 text-brand-ivory/70">
                  Coordinate your circle with clarity, care, and style.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
