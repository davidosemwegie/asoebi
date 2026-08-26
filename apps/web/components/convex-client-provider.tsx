"use client"

import type { ReactNode } from "react"
import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from "@convex-dev/better-auth/react"
import { ConvexReactClient } from "convex/react"

import { authClient } from "@/lib/auth-client"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL for the Convex client")
}

const convex = new ConvexReactClient(convexUrl)

// Better Auth 1.6.22+ exposes a named client type that the component's current
// structural prop type rejects even though the runtime contract is unchanged.
const providerAuthClient = authClient as unknown as AuthClient

function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode
  initialToken?: string | null
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={providerAuthClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  )
}

export { ConvexClientProvider }
