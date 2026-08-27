"use client"

import { useRef, useState } from "react"

import { EventForm, type EventData } from "@/components/event-form"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

type EventEditorSheetProps = {
  getReturnFocus: () => HTMLElement | null
  onOpenChange: (open: boolean) => void
  onSuccess: (eventId: Id<"events">) => void
  open: boolean
} & ({ mode: "create"; event?: never } | { mode: "edit"; event: EventData })

export function EventEditorSheet({
  event,
  getReturnFocus,
  mode,
  onOpenChange,
  onSuccess,
  open,
}: EventEditorSheetProps) {
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [isPending, setIsPending] = useState(false)
  const [formSession, setFormSession] = useState(0)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isPending) return
    onOpenChange(nextOpen)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) setFormSession((session) => session + 1)
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl"
        showCloseButton={!isPending}
        initialFocus={nameInputRef}
        finalFocus={getReturnFocus}
      >
        <SheetHeader>
          <SheetTitle>
            {mode === "edit" ? "Edit event" : "Create your celebration"}
          </SheetTitle>
          <SheetDescription>
            {mode === "edit"
              ? "Update the event details guests and organizers use."
              : "Set up the basics now. The event stays private while you finish configuring it."}
          </SheetDescription>
        </SheetHeader>

        {mode === "edit" ? (
          <EventForm
            key={`edit-${event._id}-${formSession}`}
            mode="edit"
            event={event}
            nameInputRef={nameInputRef}
            onCancel={() => handleOpenChange(false)}
            onPendingChange={setIsPending}
            onSuccess={onSuccess}
          />
        ) : (
          <EventForm
            key={`create-${formSession}`}
            mode="create"
            nameInputRef={nameInputRef}
            onCancel={() => handleOpenChange(false)}
            onPendingChange={setIsPending}
            onSuccess={onSuccess}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
