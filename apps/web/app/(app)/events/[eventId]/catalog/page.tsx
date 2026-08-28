import type { Metadata } from "next"

import { EventCatalog } from "@/components/event-catalog"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>
}): Promise<Metadata> {
  const { eventId } = await params

  return {
    title: "Items",
    alternates: { canonical: `/events/${eventId}/catalog` },
  }
}

export default function EventCatalogPage() {
  return <EventCatalog />
}
