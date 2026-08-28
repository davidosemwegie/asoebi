"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useConvexAuth, useQuery } from "convex/react"

import { orderConfirmationDestination } from "@/lib/order-step-guards"
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
    api.orders.getMineForConfirmation,
    isAuthenticated ? { orderId } : "skip"
  )
  const destination =
    data === undefined
      ? "loading"
      : orderConfirmationDestination(data, shareToken)
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace(`/e/${shareToken}/order/items`)
      return
    }
    if (data === undefined) return
    if (destination === "checkout") {
      router.replace(`/e/${shareToken}/order/items`)
      return
    }
    if (destination === "detail") router.replace(`/orders/${orderId}`)
  }, [
    data,
    destination,
    isAuthenticated,
    isLoading,
    orderId,
    router,
    shareToken,
  ])
  if (destination !== "confirmation")
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
