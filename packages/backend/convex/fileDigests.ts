const SHA256_HEX_PATTERN = /^[0-9a-fA-F]{64}$/
const SHA256_BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/

/**
 * Browser upload claims use canonical Base64 for a 32-byte SHA-256 digest.
 * Convex storage metadata uses 64-character hexadecimal. Keep the public
 * upload protocol strict while accepting either representation internally.
 */
export function isCanonicalSha256Base64(value: string) {
  if (!SHA256_BASE64_PATTERN.test(value)) return false
  try {
    return atob(value).length === 32
  } catch {
    return false
  }
}

/** Returns a lowercase hexadecimal SHA-256 digest, or null for malformed input. */
export function normalizeSha256(value: string): string | null {
  if (SHA256_HEX_PATTERN.test(value)) return value.toLowerCase()
  if (!isCanonicalSha256Base64(value)) return null

  try {
    let normalized = ""
    for (const byte of atob(value)) {
      normalized += byte.charCodeAt(0).toString(16).padStart(2, "0")
    }
    return normalized
  } catch {
    return null
  }
}

/**
 * Compare normalized digests without early exits. SHA-256 digests are not
 * secrets, but this avoids representation-dependent comparison behavior.
 */
export function sha256ValuesEqual(left: string, right: string) {
  const normalizedLeft = normalizeSha256(left)
  const normalizedRight = normalizeSha256(right)
  if (!normalizedLeft || !normalizedRight) return false

  let difference = normalizedLeft.length ^ normalizedRight.length
  const length = Math.max(normalizedLeft.length, normalizedRight.length)
  for (let index = 0; index < length; index++) {
    difference |=
      (normalizedLeft.charCodeAt(index) || 0) ^
      (normalizedRight.charCodeAt(index) || 0)
  }
  return difference === 0
}
