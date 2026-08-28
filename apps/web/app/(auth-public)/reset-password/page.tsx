import type { Metadata } from "next"

import { ResetPasswordForm } from "@/components/reset-password-form"
import { getSafeAuthContinuation } from "@/lib/auth-continuation"

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Choose a new password for your Aso Circle account.",
  alternates: { canonical: "/reset-password" },
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string | string[]
    error?: string | string[]
    next?: string | string[]
  }>
}) {
  const { token, error, next } = await searchParams

  return (
    <ResetPasswordForm
      token={typeof token === "string" ? token : undefined}
      invalidLink={typeof error === "string" || Array.isArray(error)}
      continuation={getSafeAuthContinuation(next)}
    />
  )
}
