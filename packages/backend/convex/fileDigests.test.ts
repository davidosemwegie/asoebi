import { describe, expect, it } from "vitest"

import {
  isCanonicalSha256Base64,
  normalizeSha256,
  sha256ValuesEqual,
} from "./fileDigests"

const bytes = Array.from({ length: 32 }, (_, index) => index)
const canonicalBase64 = btoa(String.fromCharCode(...bytes))
const canonicalHex = bytes
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("")

describe("file digests", () => {
  it("normalizes the browser Base64 claim and production hexadecimal metadata", () => {
    expect(canonicalBase64).toHaveLength(44)
    expect(normalizeSha256(canonicalBase64)).toBe(canonicalHex)
    expect(normalizeSha256(canonicalHex.toUpperCase())).toBe(canonicalHex)
    expect(sha256ValuesEqual(canonicalBase64, canonicalHex)).toBe(true)
    expect(sha256ValuesEqual(canonicalBase64, canonicalBase64)).toBe(true)
  })

  it("rejects mismatched and malformed SHA-256 values", () => {
    const differentHex = `ff${canonicalHex.slice(2)}`
    expect(sha256ValuesEqual(canonicalBase64, differentHex)).toBe(false)

    for (const malformed of [
      canonicalBase64.slice(0, -1),
      canonicalBase64.replace(/=$/, "A"),
      "g".repeat(64),
      "not-a-sha256",
    ]) {
      expect(isCanonicalSha256Base64(malformed)).toBe(false)
      expect(normalizeSha256(malformed)).toBeNull()
      expect(sha256ValuesEqual(malformed, canonicalHex)).toBe(false)
    }
  })
})
