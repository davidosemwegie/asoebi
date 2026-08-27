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

type AuthMode = "login" | "signup"

const authCopy = {
  login: {
    title: "Welcome back",
    description: "Sign in to your Aso Circle workspace.",
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
    <main className="min-h-svh bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="grid min-h-svh lg:grid-cols-[minmax(0,0.95fr)_minmax(34rem,1.05fr)]">
        <section className="flex min-h-svh flex-col px-6 py-7 sm:px-10 sm:py-9 lg:px-12 lg:py-10 xl:px-16">
          <Link
            href="/"
            className="w-fit font-display text-xl font-medium tracking-[-0.02em] text-[#24131e] transition-opacity hover:opacity-70"
          >
            <span>Aso Circle</span>
          </Link>

          <div className="flex flex-1 items-center py-14 lg:py-16">
            <div className="mx-auto w-full max-w-[26rem]">
              <h1 className="font-display text-[3.25rem] leading-[0.98] font-medium tracking-[-0.035em] text-balance sm:text-[3.75rem]">
                {copy.title}
              </h1>
              <p className="mt-5 max-w-sm text-[0.9375rem] leading-6 text-[#6e6e73]">
                {copy.description}
              </p>

              <form onSubmit={handleSubmit} className="mt-9">
                <FieldGroup>
                  {mode === "signup" ? (
                    <Field>
                      <FieldLabel htmlFor="name" className="text-[#1d1d1f]">
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
                        className="h-11 border-[#d2d2d7] bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.03)] placeholder:text-[#86868b] focus-visible:border-[#91b3d1] focus-visible:ring-[#91b3d1]/20 dark:border-[#d2d2d7] dark:bg-white dark:text-[#1d1d1f] dark:placeholder:text-[#86868b]"
                      />
                    </Field>
                  ) : null}

                  <Field>
                    <FieldLabel htmlFor="email" className="text-[#1d1d1f]">
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
                      className="h-11 border-[#d2d2d7] bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.03)] placeholder:text-[#86868b] focus-visible:border-[#91b3d1] focus-visible:ring-[#91b3d1]/20 dark:border-[#d2d2d7] dark:bg-white dark:text-[#1d1d1f] dark:placeholder:text-[#86868b]"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="password" className="text-[#1d1d1f]">
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
                      className="h-11 border-[#d2d2d7] bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.03)] focus-visible:border-[#91b3d1] focus-visible:ring-[#91b3d1]/20 dark:border-[#d2d2d7] dark:bg-white dark:text-[#1d1d1f]"
                    />
                    {mode === "signup" ? (
                      <FieldDescription
                        id="password-description"
                        className="text-[#6e6e73]"
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
                      className="h-11 w-full border-[#1d1d1f] bg-[#1d1d1f] text-white shadow-none transition-colors hover:bg-[#333336]"
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
                    <FieldDescription className="text-center text-[#6e6e73]">
                      {copy.alternatePrompt}{" "}
                      <Link
                        href={copy.alternateHref}
                        className="font-medium text-[#1d1d1f] underline decoration-[#a8a8ad] underline-offset-4 transition-colors hover:text-[#321727]"
                      >
                        {copy.alternateAction}
                      </Link>
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
            </div>
          </div>

          <p className="hidden text-xs text-[#86868b] sm:block">
            Private workspace access
          </p>
        </section>

        <aside className="hidden p-3 pl-0 lg:block">
          <div className="relative h-full min-h-[calc(100svh-1.5rem)] overflow-hidden rounded-2xl border border-black/5 bg-[#e9e8e4]">
            <Image
              src="/images/aso-oke-editorial.jpg"
              alt="A collection of handwoven Nigerian Aso Oke textiles in Aso Circle's signature colors"
              fill
              priority
              sizes="(min-width: 1024px) 55vw, 0px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/10" aria-hidden="true" />
            <div className="absolute right-8 bottom-8 left-8 max-w-md text-white [text-shadow:0_1px_18px_rgba(0,0,0,0.35)]">
              <p className="text-xs font-medium tracking-[0.16em] uppercase">
                Nigerian Aso Oke
              </p>
              <h2 className="mt-3 font-display text-3xl leading-[1.05] font-medium tracking-[-0.025em] text-balance xl:text-4xl">
                Woven for celebration.
              </h2>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
