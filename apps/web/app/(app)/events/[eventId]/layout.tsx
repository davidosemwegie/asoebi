import { EventWorkspace } from "@/components/event-workspace"

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
