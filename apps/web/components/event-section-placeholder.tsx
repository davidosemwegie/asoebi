import { ConstructionIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export function EventSectionPlaceholder({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Empty className="min-h-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ConstructionIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-lg">{title}</EmptyTitle>
        <EmptyDescription className="text-base">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
