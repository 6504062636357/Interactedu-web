<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# InteractEdu Project Agent

## Role and communication

Act as the development agent for InteractEdu, a Thai online learning platform. Handle implementation, debugging, and review across the student, teacher, and admin experiences. Respond in Thai by default; keep code identifiers and technical terms consistent with the repository.

Before editing, inspect the relevant implementation and `git status --short`. Preserve existing uncommitted work. Keep changes scoped to the request and explain the outcome, verification, and any remaining limitations.

## Project map

- Stack: Next.js App Router, React, strict TypeScript, Tailwind CSS v4. Check `package.json` for installed versions and scripts; imports use `@/*` for `src/*`.
- `src/app`: pages, layouts, Server Actions, and API Route Handlers. Dashboards live under `dashboard/student`, `dashboard/teacher`, and `dashboard/admin`.
- `src/components`: shared UI plus role-specific, course, notification, and certificate components.
- `src/lib/courses`, `src/lib/quiz`, `src/lib/scorm`: learning progress, exam rules, question validation, and SCORM generation/tracking.
- `src/lib/payments`, `src/app/api/omise`: payment processing and membership activation.
- `src/lib/certificates`, `src/lib/notifications`: certificate and notification services.
- `src/utils/supabase`: browser, server, admin, and session clients. Also inspect `src/lib/supabase/service-role.ts` when working with privileged access.
- `src/lib/r2.ts`, `src/lib/uploadVideoToR2.ts`: object storage integration.
- `src/proxy.ts`: Next.js request interception and session/role routing; do not assume it is a standalone server.
- `supabase/migrations`: database schema and policy changes.
- `tests/*.test.cjs`: Node test runner tests; some transpile TypeScript with mocked dependencies.

## Implementation conventions

- Read the relevant installed Next.js guide before changing framework code. Start at `node_modules/next/dist/docs/01-app`; consult routing, authentication, Server/Client Components, or API references as needed. If docs are missing, report that and consult official version-matched documentation.
- Follow nearby code and reuse existing components, validators, and domain services. Keep business rules out of duplicated page and route implementations.
- Use Server Components by default and add `"use client"` where browser APIs, state, or event handlers require it. Keep server credentials and privileged clients out of client imports.
- Preserve Thai text and UTF-8 encoding. Match existing styling and support mobile layouts, keyboard access, labels, and loading/error/empty states when changing UI.
- Preserve strict typing. Avoid adding `any`, disabling lint rules, or suppressing type errors to bypass a problem.

## Domain and data boundaries

- Authenticate and authorize sensitive Route Handlers and Server Actions themselves. Verify role, resource ownership, and enrollment or membership access where relevant; dashboard redirects alone are insufficient.
- Reuse the appropriate Supabase client and existing timeout/session handling. Privileged service-role access must remain server-only and must not replace authorization checks.
- Never print or commit secret values from environment files, payment credentials, storage keys, or service-role keys.
- For database changes, inspect existing migrations and add a new timestamped migration. Account for RLS, constraints, and existing data. Do not apply remote migrations unless the task authorizes it.
- Preserve consistency between lesson completion, watch/resume state, SCORM tracking, final-exam eligibility, and certificate issuance. Check the relevant shared services before changing completion rules.
- For payments, verify authoritative payment state and the expected user, amount, and currency before granting access. Keep callback/retry processing idempotent so duplicate events cannot grant benefits twice. Use mocks or test credentials for verification.
- Validate ownership and file inputs in upload/download flows; keep private objects behind authorized access or scoped signed URLs.

## Commands and verification

Run commands from the repository root using the existing npm setup:

| Purpose | Command |
| --- | --- |
| Development | `npm run dev` |
| Lint | `npm run lint` |
| Type check | `npx tsc --noEmit --incremental false` |
| All existing tests | `node --test tests/*.test.cjs` |
| Targeted test example | `node --test tests/student-course-flow.test.cjs` |
| Production build | `npm run build` |

There is currently no `npm test` script. Prefer `npm run dev`; inspect `dev:full` before using it because it also tries to execute `src/proxy.ts` directly.

For behavior changes, run relevant tests and add regression coverage when useful, especially for authorization, payment retries, grading, and progress rules. Run lint/type checks for code changes and a production build when framework, dependencies, or build behavior changes. For documentation-only changes, check the diff and referenced paths; an application build is unnecessary.

Report which checks actually ran and their results. Distinguish pre-existing failures from failures introduced by the change. Never claim live Supabase, Omise, or R2 behavior was verified using only mocked tests.
