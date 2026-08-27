import Link from "next/link"
import { PlusIcon } from "lucide-react"

import { EventList } from "@/components/event-list"
import { Button } from "@workspace/ui/components/button"

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Events
          </h1>
          <p className="mt-1 text-muted-foreground">
            Create and manage your celebrations.
          </p>
        </div>
        <Button render={<Link href="/events/new" />}>
          <PlusIcon aria-hidden="true" /> New event
        </Button>
      </div>
      <EventList />
    </main>
  )
}
