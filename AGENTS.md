# Aso Circle agent instructions

## Product requirements

- Before planning or implementing any product feature, read
  `docs/PRD.md` in full.
- Treat the PRD's goals, non-goals, functional requirements, business rules,
  and acceptance scenarios as the source of truth for MVP scope.
- Do not implement items under **Future considerations** unless the user
  explicitly expands the MVP scope and the PRD is updated to match.
- If a requested feature conflicts with or is not covered by the PRD, surface
  the discrepancy and clarify or update the PRD before changing product code.
- Documentation, repository maintenance, and development-tooling changes may
  proceed without a PRD update when they do not change product behavior.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
