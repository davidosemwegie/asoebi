import { HomeIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export default function HomePage() {
  return (
    <Empty className="min-h-[calc(100svh-6rem)] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HomeIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Home</EmptyTitle>
        <EmptyDescription>
          Your Asoebi workspace is ready. Event planning tools will appear here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
