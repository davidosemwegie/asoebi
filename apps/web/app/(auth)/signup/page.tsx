import type { Metadata } from "next"

import { AuthForm } from "@/components/auth-form"

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create your Aso Circle account.",
  alternates: { canonical: "/signup" },
}

export default function SignupPage() {
  return <AuthForm mode="signup" />
}
