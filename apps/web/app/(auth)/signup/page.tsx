import { AuthForm } from "@/components/auth-form"
import { getSafeAuthContinuation } from "@/lib/auth-continuation"

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams

  return <AuthForm mode="signup" continuation={getSafeAuthContinuation(next)} />
}
