const ORDER_ID_PATTERN = /^[A-Za-z0-9]{1,128}$/
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  const { getToken } = await import("@/lib/auth-server")
  const token = await getToken()
  if (!token || !convexSiteUrl || !ORDER_ID_PATTERN.test(orderId)) {
    return new Response("Not found", { status: 404 })
  }
  try {
    const upstream = await fetch(
      `${convexSiteUrl}/private-order-receipt/v1/${encodeURIComponent(orderId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    )
    const contentType = upstream.headers.get("content-type")
    if (
      !upstream.ok ||
      !upstream.body ||
      !contentType ||
      !ALLOWED_TYPES.has(contentType)
    ) {
      return new Response("Not found", { status: 404 })
    }
    const extension =
      contentType === "application/pdf"
        ? "pdf"
        : contentType === "image/png"
          ? "png"
          : "jpg"
    return new Response(upstream.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="payment-receipt.${extension}"`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
