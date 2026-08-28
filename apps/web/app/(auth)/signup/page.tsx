import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthForm } from "@/components/auth-form"
import { getSafeAuthContinuation } from "@/lib/auth-continuation"
import { isAuthenticated } from "@/lib/auth-server"

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create your Aso Circle account.",
  alternates: { canonical: "/signup" },
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  const continuation = getSafeAuthContinuation(next)
  if (await isAuthenticated()) redirect(continuation)

  return <AuthForm mode="signup" continuation={continuation} />
}
