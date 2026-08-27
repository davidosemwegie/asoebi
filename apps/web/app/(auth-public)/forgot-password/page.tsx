import { ForgotPasswordForm } from "@/components/forgot-password-form"
import { getSafeAuthContinuation } from "@/lib/auth-continuation"

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams

  return <ForgotPasswordForm continuation={getSafeAuthContinuation(next)} />
}
