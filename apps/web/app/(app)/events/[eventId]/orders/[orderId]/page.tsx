import { OrganizerOrderDetail } from "@/components/organizer-order-detail"
export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  return <OrganizerOrderDetail orderId={orderId} />
}
