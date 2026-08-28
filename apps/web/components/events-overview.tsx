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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 py-8 md:py-12">
      <header>
        <h1 className="font-display text-4xl leading-none font-medium tracking-tight text-balance sm:text-5xl">
          Home
        </h1>
        <p className="mt-3 max-w-xl text-base text-pretty text-muted-foreground">
          Manage events you organise and orders you place as a guest.
        </p>
      </header>

      <section
        aria-labelledby="organised-events-heading"
        className="space-y-5 border-t border-border/80 pt-7"
      >
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2
              id="organised-events-heading"
              className="font-display text-3xl font-medium tracking-tight text-balance"
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
            className="min-h-12 w-full text-base sm:w-auto"
            onClick={(event) => openCreateEditor(event.currentTarget)}
          >
            <PlusIcon aria-hidden="true" /> New event
          </Button>
        </div>
        <EventList onCreate={openCreateEditor} />
      </section>

      <section
        aria-labelledby="my-orders-heading"
        className="space-y-5 border-t border-border/80 pt-7"
      >
        <div>
          <h2
            id="my-orders-heading"
            className="font-display text-3xl font-medium tracking-tight text-balance"
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
