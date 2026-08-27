"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { EventEditorSheet } from "@/components/event-editor-sheet"
import { EventList } from "@/components/event-list"
import { Button } from "@workspace/ui/components/button"

export function EventsOverview({ createOpen }: { createOpen: boolean }) {
  const router = useRouter()
  const primaryCreateButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const openedFromTriggerRef = useRef(false)

  function openCreateEditor(trigger: HTMLElement) {
    returnFocusRef.current = trigger
    openedFromTriggerRef.current = true
    router.push("/?eventEditor=create", { scroll: false })
  }

  function closeCreateEditor() {
    if (openedFromTriggerRef.current) {
      openedFromTriggerRef.current = false
      router.back()
    } else {
      router.replace("/", { scroll: false })
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-balance">
            Events
          </h1>
          <p className="mt-1 text-pretty text-muted-foreground">
            Create and manage your celebrations.
          </p>
        </div>
        <Button
          ref={primaryCreateButtonRef}
          type="button"
          onClick={(event) => openCreateEditor(event.currentTarget)}
        >
          <PlusIcon aria-hidden="true" /> New event
        </Button>
      </div>

      <EventList onCreate={openCreateEditor} />

      <EventEditorSheet
        mode="create"
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateEditor()
        }}
        onSuccess={(eventId) => router.replace(`/events/${eventId}`)}
        getReturnFocus={() =>
          returnFocusRef.current ?? primaryCreateButtonRef.current
        }
      />
    </main>
  )
}
