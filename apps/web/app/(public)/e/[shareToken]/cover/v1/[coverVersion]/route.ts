import { NextResponse } from "next/server"

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/
const VERSION_PATTERN = /^[a-z0-9]{14}$/
const CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=60"

function defaultBanner(request: Request) {
  const response = NextResponse.redirect(
    new URL("/images/default-event-banner.webp", request.url),
    307
  )
  response.headers.set("Cache-Control", "no-store")
  return response
}

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ shareToken: string; coverVersion: string }>
  }
) {
  const { shareToken, coverVersion } = await params
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  if (
    !TOKEN_PATTERN.test(shareToken) ||
    !VERSION_PATTERN.test(coverVersion) ||
    !convexSiteUrl
  ) {
    return defaultBanner(request)
  }

  try {
    const upstream = await fetch(
      `${convexSiteUrl}/public-event-cover/v1/${coverVersion}/${shareToken}`,
      { cache: "no-store" }
    )
    const contentType = upstream.headers.get("content-type")
    if (
      !upstream.ok ||
      !upstream.body ||
      !contentType ||
      !["image/jpeg", "image/png", "image/webp"].includes(contentType)
    ) {
      return defaultBanner(request)
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return defaultBanner(request)
  }
}
