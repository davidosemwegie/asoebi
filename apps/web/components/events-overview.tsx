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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 py-8 md:py-12">
      <div className="flex items-end justify-between gap-6 border-b border-border/80 pb-7">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl leading-none font-medium tracking-tight text-balance sm:text-5xl">
            Events
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
            Plan every detail, gather your people, and make each event feel
            effortless.
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
