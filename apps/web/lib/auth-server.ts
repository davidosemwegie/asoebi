import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convexSiteUrl =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL

if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL for Better Auth")
}

if (!convexSiteUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_SITE_URL for Better Auth")
}

type AuthHelpers = ReturnType<typeof convexBetterAuthNextJs>

const authHelpers = convexBetterAuthNextJs({
  convexUrl,
  convexSiteUrl,
})

export const handler: AuthHelpers["handler"] = authHelpers.handler
export const preloadAuthQuery: AuthHelpers["preloadAuthQuery"] =
  authHelpers.preloadAuthQuery
export const isAuthenticated: AuthHelpers["isAuthenticated"] =
  authHelpers.isAuthenticated
export const getToken: AuthHelpers["getToken"] = authHelpers.getToken
