import { EventForm } from "@/components/event-form"

export default function NewEventPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-primary">New event</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Create your celebration
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Set up the event basics now. Your event stays private and in draft
          while you add items, payment instructions, and fulfillment options.
        </p>
      </div>
      <EventForm />
    </main>
  )
}
