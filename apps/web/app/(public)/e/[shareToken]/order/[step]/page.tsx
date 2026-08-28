import { notFound } from "next/navigation"

import { OrderFlow } from "@/components/order-flow"
import { ORDER_STEPS, type OrderStep } from "@/lib/order-step-guards"

export default async function OrderStepPage({
  params,
}: {
  params: Promise<{ shareToken: string; step: string }>
}) {
  const { shareToken, step } = await params
  if (!ORDER_STEPS.includes(step as OrderStep)) notFound()
  return <OrderFlow shareToken={shareToken} step={step as OrderStep} />
}
