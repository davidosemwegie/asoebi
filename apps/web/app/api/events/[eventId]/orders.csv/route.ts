import { createOrderCsv } from "@/lib/order-csv"

const EVENT_ID_PATTERN = /^[A-Za-z0-9]{1,128}$/
const FILTERS = [
  "search",
  "paymentStatus",
  "progress",
  "fulfillmentOptionId",
  "itemId",
] as const

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  const { getToken } = await import("@/lib/auth-server")
  const token = await getToken()
  if (!token || !convexSiteUrl || !EVENT_ID_PATTERN.test(eventId))
    return new Response("Not found", { status: 404 })
  const requestUrl = new URL(request.url)
  const filters = new URLSearchParams()
  for (const filter of FILTERS) {
    const value = requestUrl.searchParams.get(filter)
    if (value) filters.set(filter, value.slice(0, 160))
  }
  try {
    const upstream = await fetch(
      `${convexSiteUrl}/private-order-export/v1/${encodeURIComponent(eventId)}?${filters}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    )
    if (!upstream.ok) return new Response("Not found", { status: 404 })
    const rows = await upstream.json()
    if (!Array.isArray(rows)) return new Response("Not found", { status: 404 })
    const encoder = new TextEncoder()
    const csv = createOrderCsv(rows)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(csv))
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="event-orders-${eventId}.csv"`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
