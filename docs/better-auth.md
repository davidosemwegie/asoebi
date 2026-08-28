# Better Auth + Convex setup

This project uses the packaged `@convex-dev/better-auth` component with Better
Auth email/password authentication. It does not use the local-component schema
generation flow.

## Retrieved installation contract

Upstream install command:

```bash
npm install @convex-dev/better-auth
```

This pnpm monorepo installs the direct dependencies in both workspaces that
import them:

```bash
pnpm --filter @workspace/backend add @convex-dev/better-auth@0.12.5 better-auth@~1.6.15
pnpm --filter web add @convex-dev/better-auth@0.12.5 better-auth@~1.6.15
```

`better-auth@~1.6.15` currently resolves to the security-patched `1.6.30`
release and remains inside the component's supported `>=1.6.11 <1.7.0` peer
range.

Primary references:

- [Convex component markdown](https://www.convex.dev/components/better-auth/better-auth.md)
- [Convex component LLM index](https://www.convex.dev/components/better-auth/llms.txt)
- [Convex component skill](https://www.convex.dev/components/better-auth/SKILL.md)
- [Convex + Better Auth Next.js guide](https://labs.convex.dev/better-auth/framework-guides/next)
- [Better Auth Convex integration](https://better-auth.com/docs/integrations/convex)
- [Better Auth email/password guide](https://better-auth.com/docs/authentication/email-password)

## Exact setup checklist

1. Install `@convex-dev/better-auth` and Better Auth in `packages/backend` and
   `apps/web`.
2. Mount the packaged component in
   `packages/backend/convex/convex.config.ts`.
3. Declare the auth and email variables in the Convex app definition so
   generated backend code has typed environment access.
4. Add `packages/backend/convex/auth.config.ts` with
   `getAuthConfigProvider()`.
5. Add `packages/backend/convex/auth.ts` with the component adapter, Convex
   plugin, email/password enabled, and a validated current-user query.
6. Allow localhost, David's exact Tailscale development host, the production
   aliases, and only Asoebi's ClearJar Vercel preview host pattern in Better
   Auth's dynamic base URL configuration.
7. Register Better Auth HTTP actions in `packages/backend/convex/http.ts`.
8. Run `pnpm --filter @workspace/backend exec convex dev --once` to mount the
   component and regenerate `components.betterAuth`.
9. Add the Better Auth browser client and Next.js server helpers under
   `apps/web/lib`.
10. Proxy same-origin `GET` and `POST` auth requests through
    `apps/web/app/api/auth/[...all]/route.ts`.
11. Replace the plain Convex provider with `ConvexBetterAuthProvider` and pass
    the server token from the async root layout.
12. Protect the application route group with `isAuthenticated()` and preload
    the validated current-user query for the sidebar user menu.
13. Keep `/login` and `/signup` outside the sidebar and guest-only. Keep
    `/forgot-password`, `/reset-password`, and `/verify-email` outside that
    guest-only layout so links remain usable with an existing session.
14. Wire signup, login, and logout to `authClient.signUp.email`,
    `authClient.signIn.email`, and `authClient.signOut`.
15. Configure the Vercel build to inject both the deployment-specific Convex
    cloud URL and site URL into the Next.js build.
16. Mount the official `@convex-dev/resend` component, register its verified
    webhook route, and schedule the bounded seven-day finalized-body and
    28-day abandoned-record cleanup jobs.
17. Set independent development, preview-default, and production Convex auth,
    email, and site URL configuration.

## Environment variables

| Variable                      | Target                                | Requirement                                                                                                                                              |
| ----------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`          | Every Convex deployment               | Required secret. Generate a stable, high-entropy value per environment. Never prefix it with `NEXT_PUBLIC_`.                                             |
| `SITE_URL`                    | Every Convex deployment               | Required external-origin fallback. Local uses `http://localhost:3000`; production and preview defaults use the production Vercel alias.                  |
| `RESEND_API_KEY`              | Every email-enabled Convex deployment | Required to enqueue through Resend. Use a separately scoped secret for each environment where possible. Never expose it to Next.js.                      |
| `RESEND_WEBHOOK_SECRET`       | Every email-enabled Convex deployment | Required to accept signed events at `<CONVEX_SITE_URL>/resend-webhook`. Copy the signing secret from the matching Resend webhook.                        |
| `EMAIL_FROM`                  | Every Convex deployment               | Sender in `Name <address@example.com>` form. A verified Resend domain is required for live delivery. Test mode may use `Asoebi <onboarding@resend.dev>`. |
| `EMAIL_DELIVERY_MODE`         | Every Convex deployment               | Must be exactly `test` or `live`. Omission fails safe to `test`; set `live` explicitly only for production after domain and webhook verification.        |
| `NEXT_PUBLIC_CONVEX_URL`      | Next.js/Vercel                        | Required `.convex.cloud` URL for the matching deployment.                                                                                                |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Next.js/Vercel                        | Required matching `.convex.site` URL for the auth proxy. The Vercel build derives it from the `.convex.cloud` URL injected by `convex deploy`.           |
| `NEXT_PUBLIC_SITE_URL`        | Next.js/Vercel                        | Documented for future absolute verification and reset links. Local development uses `http://localhost:3000`.                                             |
| `CONVEX_DEPLOYMENT`           | Local Convex tooling                  | Generated by Convex for the selected development deployment.                                                                                             |
| `CONVEX_DEPLOY_KEY`           | Vercel build                          | Required by the existing Convex Preview/Production deployment workflow; not a Better Auth runtime variable.                                              |
| `CONVEX_SITE_URL`             | Convex runtime                        | Platform-provided. Do not configure it manually.                                                                                                         |

Safe secret setup example:

```bash
openssl rand -base64 32 | pnpm --filter @workspace/backend exec convex env set BETTER_AUTH_SECRET
printf '%s\n' 'http://localhost:3000' | pnpm --filter @workspace/backend exec convex env set SITE_URL
pnpm --filter @workspace/backend exec convex env set RESEND_API_KEY
pnpm --filter @workspace/backend exec convex env set RESEND_WEBHOOK_SECRET
printf '%s\n' 'Asoebi <onboarding@resend.dev>' | pnpm --filter @workspace/backend exec convex env set EMAIL_FROM
printf '%s\n' 'test' | pnpm --filter @workspace/backend exec convex env set EMAIL_DELIVERY_MODE
```

Development, CI-adjacent test deployments, and previews must remain in `test`
mode. In that mode the outbox replaces every real recipient with a stable
`delivered+asoebi-…@resend.dev` test address before enqueueing. Set `live` only
on production after `EMAIL_FROM` uses a verified domain and the production
webhook is reporting signed events.

The durable application outbox keeps compact notification and attempt audit
rows. It never stores provider email bodies in those audit rows. Component
bodies are removed after seven days, abandoned component records after 28
days, and expired token-bearing application payloads are scrubbed in bounded
batches. Hard bounces, complaints, and provider suppression block later
retries to the same normalized address; transient failures and delays remain
retryable by the notification owner.

## Verification

Run static validation:

```bash
pnpm --filter @workspace/backend typecheck
pnpm --filter @workspace/ui typecheck
pnpm --filter web typecheck
pnpm lint
pnpm build
```

Then verify the runtime flow:

1. Start `pnpm dev` and open `/`; an unauthenticated request must redirect to
   `/login`.
2. Confirm `GET /api/auth/get-session` returns `200` with no session before
   login.
3. Create an account at `/signup` with a name, email, and an 8–128 character
   password. Confirm the visible verification state does not block sign-in.
4. Confirm `POST /api/auth/sign-up/email` returns `200`, the session endpoint
   returns the same user, `/` renders the user's name and email, and the
   verification email appears only at the configured Resend test recipient.
5. Hard-refresh `/` and confirm the server-rendered authenticated shell remains
   stable.
6. Sign out and confirm `/` redirects to `/login` and stale user data is not
   rendered.
7. Submit an incorrect password and confirm the UI shows an accessible error
   while the endpoint returns `401`.
8. Sign in with the correct password and confirm the same user is rendered.
9. Verify `/settings`, the responsive sidebar, keyboard navigation, and the
   absence of browser console/error-overlay failures.
10. Push the branch, wait for Vercel/Convex preview deployment checks, and run
    the same smoke flow against the protected preview with `vercel curl` where
    appropriate.
11. Request a reset for both an existing and unknown address and confirm the UI
    shows the same generic result. Complete a test reset, then confirm the link
    cannot be reused and other sessions were revoked.
12. Exercise verification success, expired/invalid result, and resend states;
    confirm all results remain visible without relying on a toast.

For development through Tailscale, use
`http://davids-mac-mini.tailfca955.ts.net:3000`. Next.js permits that exact
hostname for development assets, Better Auth permits that exact host and port,
and the development deployment uses non-secure cookies because its `SITE_URL`
is HTTP. Preview and production retain secure cookies because their `SITE_URL`
values are HTTPS.

## Current authentication boundary

Sign-in intentionally remains available before verification with
`requireEmailVerification: false`. Better Auth sends a verification message on
signup, and the existing server-side event-publish gate continues to require a
verified organizer email. Password resets use a one-hour token, return the same
visible request result whether or not an account exists, and revoke the user's
other sessions when completed.

Later event, invitation, and order PRs may call the internal typed notification
foundation and reusable templates. This slice does not expose arbitrary public
email enqueueing and does not add those business tables or mutations.
