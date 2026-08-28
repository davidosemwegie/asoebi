import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ shareToken: string }>
  searchParams: Promise<{ orderId?: string }>
}) {
  const [{ shareToken }, { orderId }] = await Promise.all([
    params,
    searchParams,
  ])
  return (
    <main className="flex min-h-dvh items-center bg-muted/30 px-4 py-8">
      <Card className="mx-auto w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-2xl">Order submitted</CardTitle>
          <CardDescription className="text-lg">
            Waiting for payment check. You can return here to see your order and
            its history.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            nativeButton={false}
            render={
              <Link
                href={orderId ? `/orders/${orderId}` : `/e/${shareToken}`}
              />
            }
            className="min-h-12"
          >
            View order
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={`/e/${shareToken}`} />}
            variant="outline"
            className="min-h-12"
          >
            Back to event
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
