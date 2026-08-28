import { redirect } from "next/navigation"

import { OrderConfirmation } from "@/components/order-confirmation"

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
  if (!orderId) redirect(`/e/${shareToken}/order/items`)
  return <OrderConfirmation shareToken={shareToken} orderId={orderId} />
}
