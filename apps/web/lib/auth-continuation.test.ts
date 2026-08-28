import { describe, expect, it } from "vitest"

import { getAuthHref, getSafeAuthContinuation } from "./auth-continuation"

describe("safe auth continuation", () => {
  it.each([
    [
      "/e/abcdefghijklmnopqrstuvwxyzABCDEF",
      "/e/abcdefghijklmnopqrstuvwxyzABCDEF",
    ],
    ["/e/token?from=invite#items", "/e/token?from=invite#items"],
    ["/events/example/setup", "/events/example/setup"],
  ])("accepts a same-origin application path", (input, expected) => {
    expect(getSafeAuthContinuation(input)).toBe(expected)
  })

  it.each([
    "https://evil.test/steal",
    "//evil.test/steal",
    "/%2f%2fevil.test/steal",
    "/%252f%252fevil.test/steal",
    "/%25252f%25252fevil.test/steal",
    "/\\evil.test/steal",
    "/%5cevil.test/steal",
    "/%255cevil.test/steal",
    "/%00hidden",
    "/%2500hidden",
    "/%not-valid",
    "/login",
    "/signup/",
    "/api/auth/session",
    " /e/token",
    "/e/token ",
  ])("rejects unsafe continuation %s", (input) => {
    expect(getSafeAuthContinuation(input)).toBe("/")
  })

  it("rejects missing, repeated, and oversized values", () => {
    expect(getSafeAuthContinuation(undefined)).toBe("/")
    expect(getSafeAuthContinuation(["/e/one", "/e/two"])).toBe("/")
    expect(getSafeAuthContinuation("")).toBe("/")
    expect(getSafeAuthContinuation(`/${"a".repeat(2048)}`)).toBe("/")
  })

  it("encodes a validated continuation exactly once", () => {
    expect(getAuthHref("/login", "/e/token?source=family#items")).toBe(
      "/login?next=%2Fe%2Ftoken%3Fsource%3Dfamily%23items"
    )
    expect(getAuthHref("/login", "https://evil.test")).toBe("/login")
  })
})
