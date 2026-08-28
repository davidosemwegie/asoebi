import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { PublicEventLanding } from "@/components/public-event-landing"
import { api } from "@workspace/backend/convex/_generated/api"

export const metadata: Metadata = {
  title: "Private event | Asoebi",
  description: "View event details and available aso ebi items.",
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ shareToken: string }>
}) {
  const { shareToken } = await params
  // The request timestamp seeds the deterministic Convex query and client offset.
  // eslint-disable-next-line react-hooks/purity
  const serverNow = Date.now()
  const preloadedLanding = await preloadQuery(api.sharedEvents.getLanding, {
    shareToken,
    now: serverNow,
  })
  return (
    <PublicEventLanding
      shareToken={shareToken}
      serverNow={serverNow}
      preloadedLanding={preloadedLanding}
    />
  )
}
