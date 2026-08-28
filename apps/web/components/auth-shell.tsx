import Link from "next/link"
import { SparklesIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Link
          href="/"
          className="mx-auto inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-base font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SparklesIcon aria-hidden="true" />
          </span>
          Asoebi
        </Link>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              <h1>{title}</h1>
            </CardTitle>
            <CardDescription className="text-base">
              {description}
            </CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  )
}
