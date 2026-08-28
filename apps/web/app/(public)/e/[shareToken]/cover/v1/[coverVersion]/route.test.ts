import { afterEach, describe, expect, it, vi } from "vitest"

import { GET } from "./route"

const shareToken = "a".repeat(32)
const coverVersion = "abc1234def5678"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("public event cover proxy", () => {
  it("relays a validated image through a versioned URL with bounded caching", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), {
        headers: { "Content-Type": "image/png" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET(
      new Request(`http://localhost/e/${shareToken}/cover/v1/${coverVersion}`),
      { params: Promise.resolve({ shareToken, coverVersion }) }
    )

    expect(fetchMock).toHaveBeenCalledWith(
      `https://example.convex.site/public-event-cover/v1/${coverVersion}/${shareToken}`,
      { cache: "no-store" }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=300, stale-while-revalidate=60"
    )
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("uses the static default for malformed or unavailable covers", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Not found", { status: 404 }))
    vi.stubGlobal("fetch", fetchMock)

    const malformed = await GET(
      new Request(`http://localhost/e/${shareToken}/cover/v1/bad!`),
      { params: Promise.resolve({ shareToken, coverVersion: "bad!" }) }
    )
    expect(malformed.status).toBe(307)
    expect(malformed.headers.get("location")).toBe(
      "http://localhost/images/default-event-banner.webp"
    )
    expect(malformed.headers.get("cache-control")).toBe("no-store")
    expect(fetchMock).not.toHaveBeenCalled()

    const unavailable = await GET(
      new Request(`http://localhost/e/${shareToken}/cover/v1/${coverVersion}`),
      { params: Promise.resolve({ shareToken, coverVersion }) }
    )
    expect(unavailable.status).toBe(307)
    expect(unavailable.headers.get("cache-control")).toBe("no-store")
  })
})
