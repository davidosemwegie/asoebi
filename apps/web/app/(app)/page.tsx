import type { Metadata } from "next"

import { EventsOverview } from "@/components/events-overview"

export const metadata: Metadata = {
  title: "Events",
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ eventEditor?: string | string[] }>
}) {
  const { eventEditor } = await searchParams

  return <EventsOverview createOpen={eventEditor === "create"} />
}
