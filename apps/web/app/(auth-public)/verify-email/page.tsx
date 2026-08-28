import { VerifyEmailForm } from "@/components/verify-email-form"
import { getSafeAuthContinuation } from "@/lib/auth-continuation"

function hasSearchParam(value: string | string[] | undefined) {
  return typeof value === "string" || Array.isArray(value)
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[]
    sent?: string | string[]
    verified?: string | string[]
    next?: string | string[]
  }>
}) {
  const { error, sent, verified, next } = await searchParams

  return (
    <VerifyEmailForm
      verificationFailed={hasSearchParam(error)}
      emailSent={sent === "1"}
      verificationComplete={verified === "1" && !hasSearchParam(error)}
      continuation={getSafeAuthContinuation(next)}
    />
  )
}
