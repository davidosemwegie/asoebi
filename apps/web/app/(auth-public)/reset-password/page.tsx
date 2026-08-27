import { ResetPasswordForm } from "@/components/reset-password-form"
import { getSafeAuthContinuation } from "@/lib/auth-continuation"

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
