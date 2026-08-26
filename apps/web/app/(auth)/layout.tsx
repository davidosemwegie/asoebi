import { redirect } from "next/navigation"

import { isAuthenticated } from "@/lib/auth-server"

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  if (await isAuthenticated()) {
    redirect("/")
  }

  return children
}
