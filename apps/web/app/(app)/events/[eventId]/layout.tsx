import type { Metadata } from "next"

import { EventWorkspace } from "@/components/event-workspace"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>
}): Promise<Metadata> {
  const { eventId } = await params

  return {
    title: "Event",
    alternates: { canonical: `/events/${eventId}` },
  }
}

export default async function EventLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ eventId: string }>
}>) {
  const { eventId } = await params

  return <EventWorkspace eventId={eventId}>{children}</EventWorkspace>
}
