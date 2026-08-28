import { orderCsvHeader, orderCsvRow } from "../../../../../lib/order-csv"
import { normalizeOrderSearch } from "@workspace/backend/convex/organizerOrderFilters"

const EVENT_ID_PATTERN = /^[A-Za-z0-9]{1,128}$/
const FILTERS = [
  "search",
  "paymentStatus",
  "progress",
  "fulfillmentOptionId",
  "fulfillmentType",
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
  try {
    const requestUrl = new URL(request.url)
    const filters = new URLSearchParams()
    for (const filter of FILTERS) {
      const value = requestUrl.searchParams.get(filter)
      if (value) {
        if (filter === "search")
          filters.set(filter, normalizeOrderSearch(value) ?? "")
        else if (value.length > 128) throw new Error("Invalid order filter.")
        else filters.set(filter, value)
      }
    }
    const endpoint = `${convexSiteUrl}/private-order-export/v2/${encodeURIComponent(eventId)}`
    const upstream = await fetch(`${endpoint}?${filters}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!upstream.ok) return new Response("Not found", { status: 404 })
    const firstPage = await upstream.json()
    if (
      !firstPage ||
      !Array.isArray(firstPage.rows) ||
      typeof firstPage.isDone !== "boolean"
    )
      return new Response("Not found", { status: 404 })
    const encoder = new TextEncoder()
    let page = firstPage as {
      rows: Array<Record<string, unknown>>
      continueCursor: string | null
      isDone: boolean
    }
    let emittedHeader = false
    let rowIndex = 0
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          if (!emittedHeader) {
            controller.enqueue(encoder.encode(orderCsvHeader()))
            emittedHeader = true
          }
          if (rowIndex < page.rows.length) {
            controller.enqueue(
              encoder.encode(orderCsvRow(page.rows[rowIndex]!))
            )
            rowIndex += 1
            return
          }
          if (page.isDone || !page.continueCursor) {
            controller.close()
            return
          }
          filters.set("cursor", page.continueCursor)
          const next = await fetch(`${endpoint}?${filters}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          })
          if (!next.ok) throw new Error("Export page unavailable")
          const nextPage = await next.json()
          if (
            !nextPage ||
            !Array.isArray(nextPage.rows) ||
            typeof nextPage.isDone !== "boolean"
          )
            throw new Error("Invalid export page")
          page = nextPage
          rowIndex = 0
          if (page.rows.length > 0) {
            controller.enqueue(encoder.encode(orderCsvRow(page.rows[0]!)))
            rowIndex = 1
            return
          }
          if (page.isDone || !page.continueCursor) {
            controller.close()
            return
          }
          // Keep the readable stream pulling through a filter-empty source
          // page without adding a CSV record or buffering another page.
          controller.enqueue(new Uint8Array())
        } catch (error) {
          controller.error(error)
        }
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
