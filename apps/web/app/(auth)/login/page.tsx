import { redirect } from "next/navigation"

import { AuthForm } from "@/components/auth-form"
import { getSafeAuthContinuation } from "@/lib/auth-continuation"
import { isAuthenticated } from "@/lib/auth-server"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  const continuation = getSafeAuthContinuation(next)
  if (await isAuthenticated()) redirect(continuation)

  return <AuthForm mode="login" continuation={continuation} />
}
