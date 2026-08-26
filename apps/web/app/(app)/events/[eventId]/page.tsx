import { EventDetails } from "@/components/event-details"

export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-4">
      <EventDetails eventId={eventId} />
    </main>
  )
}
