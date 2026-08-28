"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useConvexAuth, useQuery } from "convex/react"

import { api } from "@workspace/backend/convex/_generated/api"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function OrderConfirmation({
  shareToken,
  orderId,
}: {
  shareToken: string
  orderId: string
}) {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const data = useQuery(
    api.orders.getMine,
    isAuthenticated ? { orderId: orderId as never } : "skip"
  )
  const valid =
    data &&
    data.event?.shareToken === shareToken &&
    data.order.lifecycle === "submitted"
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || (data !== undefined && !valid))) {
      router.replace(`/e/${shareToken}/order/items`)
    }
  }, [data, isAuthenticated, isLoading, router, shareToken, valid])
  if (!valid)
    return (
      <main
        className="mx-auto min-h-dvh max-w-xl px-4 py-8 text-lg"
        aria-busy="true"
      >
        Loading your order…
      </main>
    )
  return (
    <main className="flex min-h-dvh items-center bg-muted/30 px-4 py-8 text-lg">
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
            render={<Link href={`/orders/${orderId}`} />}
            className="min-h-12 text-lg"
          >
            View order
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={`/e/${shareToken}`} />}
            variant="outline"
            className="min-h-12 text-lg"
          >
            Back to event
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
