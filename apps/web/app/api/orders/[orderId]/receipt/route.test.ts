import { afterEach, describe, expect, it, vi } from "vitest"

import { GET } from "./route"

vi.mock("@/lib/auth-server", () => ({ getToken: vi.fn() }))
import { getToken } from "@/lib/auth-server"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.mocked(getToken).mockReset()
})

describe("private receipt proxy", () => {
  it("requires a token and relays only safe receipt bytes with no-store headers", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
    vi.mocked(getToken).mockResolvedValue("guest-token")
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(Uint8Array.from([1]), {
          headers: { "Content-Type": "application/pdf" },
        })
      )
    vi.stubGlobal("fetch", fetchMock)
    const response = await GET(
      new Request("http://localhost/api/orders/abc/receipt"),
      { params: Promise.resolve({ orderId: "abc" }) }
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.convex.site/private-order-receipt/v1/abc",
      { headers: { Authorization: "Bearer guest-token" }, cache: "no-store" }
    )
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("does not call the backend without an authenticated token", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site")
    vi.mocked(getToken).mockResolvedValue(undefined)
    const response = await GET(
      new Request("http://localhost/api/orders/abc/receipt"),
      { params: Promise.resolve({ orderId: "abc" }) }
    )
    expect(response.status).toBe(404)
  })
})
