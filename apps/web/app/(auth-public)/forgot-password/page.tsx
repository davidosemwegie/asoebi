import type { Metadata } from "next"

import { ForgotPasswordForm } from "@/components/forgot-password-form"
import { getSafeAuthContinuation } from "@/lib/auth-continuation"

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request password-reset instructions for Aso Circle.",
  alternates: { canonical: "/forgot-password" },
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams

  return <ForgotPasswordForm continuation={getSafeAuthContinuation(next)} />
}
