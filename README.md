# shadcn/ui monorepo template

This is a Next.js monorepo template with shadcn/ui.

## Local development

Install dependencies and link the repository to the existing Vercel project:

```bash
pnpm install
vercel link --yes --cwd apps/web --scope clearjar-studio --project asoebi
```

Pull the development environment for both the web app and the Convex backend,
then initialize the development deployment once:

```bash
vercel env pull .env.local --environment=development --yes --cwd apps/web --scope clearjar-studio
vercel env pull ../../packages/backend/.env.local --environment=development --yes --cwd apps/web --scope clearjar-studio
pnpm --filter @workspace/backend exec convex dev --once
```

Start the web app and Convex watcher together with `pnpm dev`.

Vercel previews and production builds use their environment-scoped
`CONVEX_DEPLOY_KEY` values to deploy the backend and inject
`NEXT_PUBLIC_CONVEX_URL` during the web build.

## Adding components

To add components to your app, run the following command at the root of your `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button"
```
