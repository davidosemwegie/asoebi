import { EventDetails } from "@/components/event-details"

export default async function EventDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventEditor?: string | string[] }>
}) {
  const { eventEditor } = await searchParams

  return <EventDetails editorOpen={eventEditor === "edit"} />
}
