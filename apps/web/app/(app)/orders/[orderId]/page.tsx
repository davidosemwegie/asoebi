import { OrderDetail } from "@/components/order-detail"

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  return <OrderDetail orderId={orderId} />
}
