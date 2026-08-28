"use client"

import { CircleAlertIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@workspace/ui/components/empty"

export default function PublicEventError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center bg-muted/30 px-4 py-8">
      <Empty className="mx-auto min-h-80 max-w-xl border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon aria-hidden="true" />
          </EmptyMedia>
          <h1 className="font-heading text-xl font-medium">
            Event details did not load
          </h1>
          <EmptyDescription className="text-lg">
            Check your connection and try again. Your event link has not
            changed.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={reset} className="min-h-12 text-lg">
            <RotateCcwIcon aria-hidden="true" /> Try again
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
