"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, ShoppingBagIcon } from "lucide-react"

import { EventEditorSheet } from "@/components/event-editor-sheet"
import { EventList } from "@/components/event-list"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

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
      <header>
        <h1 className="font-heading text-3xl font-semibold text-balance">
          Home
        </h1>
        <p className="mt-1 text-base text-pretty text-muted-foreground">
          Manage events you organise and orders you place as a guest.
        </p>
      </header>

      <section aria-labelledby="organised-events-heading" className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="organised-events-heading"
              className="font-heading text-2xl font-semibold text-balance"
            >
              Events I organise
            </h2>
            <p className="mt-1 text-base text-pretty text-muted-foreground">
              Create and manage your celebrations.
            </p>
          </div>
          <Button
            ref={primaryCreateButtonRef}
            type="button"
            className="min-h-12 text-base"
            onClick={(event) => openCreateEditor(event.currentTarget)}
          >
            <PlusIcon aria-hidden="true" /> New event
          </Button>
        </div>
        <EventList onCreate={openCreateEditor} />
      </section>

      <section aria-labelledby="my-orders-heading" className="space-y-4">
        <div>
          <h2
            id="my-orders-heading"
            className="font-heading text-2xl font-semibold text-balance"
          >
            My orders
          </h2>
          <p className="mt-1 text-base text-pretty text-muted-foreground">
            Orders you place as a guest will appear here.
          </p>
        </div>
        <Empty className="min-h-56 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingBagIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle className="text-base">No orders yet</EmptyTitle>
            <EmptyDescription className="text-base">
              You have not placed an order. Guest ordering will appear here when
              it is available.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>

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
