const DEFAULT_AUTH_CONTINUATION = "/"
const AUTH_LOOP_PATHS = new Set([
  "/forgot-password",
  "/login",
  "/reset-password",
  "/signup",
  "/verify-email",
])

function hasControlCharacters(value: string) {
  for (const character of value) {
    const characterCode = character.charCodeAt(0)
    if (characterCode <= 31 || characterCode === 127) {
      return true
    }
  }

  return false
}

export function getSafeAuthContinuation(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return DEFAULT_AUTH_CONTINUATION
  }

  if (
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlCharacters(value)
  ) {
    return DEFAULT_AUTH_CONTINUATION
  }

  try {
    const baseUrl = new URL("https://asoebi.invalid")
    const candidate = new URL(value, baseUrl)
    const decodedPathname = decodeURIComponent(candidate.pathname).toLowerCase()
    const normalizedPathname =
      decodedPathname.length > 1
        ? decodedPathname.replace(/\/+$/, "")
        : decodedPathname

    if (
      candidate.origin !== baseUrl.origin ||
      candidate.username ||
      candidate.password ||
      decodedPathname.startsWith("//") ||
      decodedPathname.includes("\\") ||
      hasControlCharacters(decodedPathname) ||
      AUTH_LOOP_PATHS.has(normalizedPathname) ||
      normalizedPathname === "/api/auth" ||
      normalizedPathname.startsWith("/api/auth/")
    ) {
      return DEFAULT_AUTH_CONTINUATION
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`
  } catch {
    return DEFAULT_AUTH_CONTINUATION
  }
}

export function getAuthHref(pathname: string, continuation: string) {
  const safeContinuation = getSafeAuthContinuation(continuation)

  if (safeContinuation === DEFAULT_AUTH_CONTINUATION) {
    return pathname
  }

  const searchParams = new URLSearchParams({ next: safeContinuation })
  return `${pathname}?${searchParams.toString()}`
}
