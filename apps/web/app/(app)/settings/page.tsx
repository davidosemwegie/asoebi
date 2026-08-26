import { Settings2Icon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export default function SettingsPage() {
  return (
    <Empty className="min-h-[calc(100svh-6rem)] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Settings2Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Settings</EmptyTitle>
        <EmptyDescription>
          Account and workspace settings will be available here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
