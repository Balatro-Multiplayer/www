# Research: Extracting balatromp.com onto a simpler, faster stack

**Status:** Research / proposal — no code changes implied by this document.
**Date:** 2026-08-22

## TL;DR / Recommendation

The app is far more portable than it looks. It is effectively a **client-heavy React
SPA + a typed tRPC API + a Postgres/Redis/MinIO backend**, wearing a Next.js shell:

- 0 server actions, no middleware, 114 `'use client'` files
- All data access goes through 18 tRPC routers or 12 plain REST routes
- The domain logic (log parser, ranked-choice tallying, bracket math, cheat
  detection) already lives framework-free in `src/lib` + `src/shared`, with 86
  passing unit tests

**Recommended target:** a small Bun monorepo —

| Piece | Target | Why |
|---|---|---|
| Domain logic + DB schema | `packages/core` (pure TS) | Already framework-free; moves as-is with its tests |
| API | **Hono on Bun**, hosting the *existing* tRPC routers via the fetch adapter, plus the REST routes | tRPC is framework-agnostic; 18 routers port nearly unchanged — this is the single biggest risk-reducer |
| Web app | **Vite + React + TanStack Router/Query**, static files behind the API or a CDN | Keeps all 114 client components and shadcn/Radix UI as-is; sub-second dev loop; boring, stable tooling |
| Auth | **better-auth** (Discord provider, Drizzle adapter) | Replaces `next-auth@5.0.0-beta.30` — a beta dependency in production |
| Docs/blog | Static (Astro, or fumadocs-core headless) built at deploy time | Content is MDX on disk; it doesn't need the app server at all |

**Not recommended:** rewriting the UI in another framework (Svelte/Solid/HTMX).
The complexity here is mostly *essential* (33 tables, an admin panel, Discord
integration, a 57 KB log parser). A UI-framework rewrite re-risks all of it for
marginal wins. The accidental complexity is the Next/RSC layer — that's what to
remove.

**Do first, regardless of migration:** the tooling hardening in
[§6](#6-bulletproof-tooling-blueprint). Half of it (run the tests in CI, pin
versions, Renovate, pinned Docker base) applies to the current repo today and is
prerequisite to any safe migration.

---

## 1. Current stack inventory

Scaffolded from create-t3-app (`ct3aMetadata` 7.39.2), since grown considerably.

**Framework:** Next.js 16 (App Router) + React 19, built and run on Bun,
deployed via Docker (standalone output).

**Data & infra:**
- Postgres via Drizzle ORM — **33 tables**, 18 migrations
- Redis — player/queue state mirroring, leaderboard + season caching
  (`server/redis.ts`, `services/leaderboard.ts`, `server/seasons.ts`)
- MinIO (S3) — two buckets: uploaded log files, leaderboard snapshots
- Discord: OAuth (NextAuth), a bot token (`discord.service.ts`),
  NeatQueue webhook ingestion (`api/neatqueue-webhook`)

**API surface:**
- 18 tRPC v11 routers (`server/api/routers/`): leaderboard, players, stats,
  polls, brackets, seasons, moderation, blog, bounties, releases, logs, …
- 12 REST routes (`app/api/`): auth, uploads, webhook, transcript, search,
  releases, refresh-leaderboard, dev-login

**UI:** ~30 Radix packages (shadcn-style `components/ui`), Tailwind 4,
TanStack Query/Table/Virtual, recharts, react-hook-form + zod, nuqs, sonner.

**Content:** fumadocs (MDX docs under `content/docs`), DB-backed blog,
docs OG-image generation (`app/docs-og`).

**Tooling today:** Biome (lint+format), `tsc --noEmit`, `bun test`
(7 test files, 86 tests, ~260 ms), CI = typecheck + Biome only.

## 2. Feature inventory and portability

| Feature | Where | Coupling to Next | Portability |
|---|---|---|---|
| Log parser (client-side Lua log analysis, deck view, idol hits) | `(home)/log-parser`, `lib/log-source-parser.ts` (57 KB, tested) | None — pure client + pure lib | **Trivial** |
| Leaderboards + seasons + snapshots | `(home)/leaderboards`, `services/leaderboard.ts`, Redis/MinIO | SSR page shells calling tRPC; ISR-ish revalidate in a few spots | **Easy** — data layer is tRPC already |
| Players / profiles / stats | `(home)/players`, `stats`, routers | Same pattern | **Easy** |
| Polls (ranked choice) | `(home)/polls`, `lib/ranked-choice.ts` (tested) | None in the logic | **Trivial** logic, easy UI |
| Brackets / playoffs / Major League Balatro | `(home)/playoffs`, `lib/bracket.ts` (tested) | Same | **Easy** |
| Admin panel (13 sections: moderation, bans, seasons, queue settings, releases, stream, …) | `(home)/admin` | Client-heavy forms over tRPC; zero SEO needs | **Easy but large** — biggest surface by page count |
| Blog + docs | `(home)/blog`, `app/docs`, fumadocs | **Highest Next coupling** (fumadocs-mdx, docs-og) | **Medium** — see §5 |
| Transcript viewer / stream-card (OBS overlays) | `app/transcript`, `app/stream-card` | Server-rendered pages | **Easy** — can be SPA routes or tiny server-rendered pages |
| Uploads (logs → MinIO) | `api/upload`, `api/logs/upload` | Plain route handlers | **Trivial** — Hono handlers |
| NeatQueue webhook, releases API, search | `app/api/*` | Plain route handlers | **Trivial** |
| Auth (Discord OAuth) | NextAuth v5 **beta** + Drizzle adapter | High — NextAuth is Next-shaped | **Medium** — the one real migration project; see §5 |
| OG images (docs-og) | satori-style generation | Medium | **Easy** — satori/resvg run fine in Hono/Bun |

Crown jewel: `src/lib` + `src/shared` (~150 KB of pure domain TS **with tests**)
has zero framework imports. Whatever stack is chosen, this moves unchanged.

## 3. Where the complexity actually lives

Being honest about what "simpler" can buy:

**Essential (survives any rewrite):** 33 tables, Discord/NeatQueue integration,
season/snapshot lifecycle, moderation rules, the log parser, ~40 routed pages.

**Accidental (what the migration removes):**
- The RSC/hydration split — 114 files opt out of server components; the team is
  fighting the framework's default, paying its costs (build time, hydration
  complexity, `HydrateClient`/`api` server-caller indirection) without using its
  wins (no server actions, minimal true SSR)
- `next-auth@5.0.0-beta.30` — beta auth dependency in production
- `next-intl` — installed, configured, **zero `useTranslations` call sites**, one
  locale file; pure dead weight
- `superjson`, `nuqs`, custom `image-loader.js`, `next-plausible` — each a small
  patch over a Next-shaped problem; TanStack Router's typed search params replace
  nuqs outright, a script tag replaces next-plausible
- Duplicated API idioms: tRPC *and* ad-hoc REST routes; in Hono both live in one
  app with one middleware stack
- Docker builds of Next 16 standalone output — vs. `vite build` (static dir) +
  a Bun server whose cold start is milliseconds

**Speed wins, concretely:** Vite dev server + HMR vs `next dev` on a 276-file
app; CI build minutes; SPA assets cacheable on any CDN; no hydration of
server-component trees; API latency unchanged (same DB/Redis work).

## 4. Candidate stacks compared

### A. Vite + React SPA (TanStack Router) + Hono API — **recommended**
- **Reuse:** ~all UI components, all tRPC routers, all domain logic, Drizzle,
  Tailwind. The rewrite is mostly *routing shells and data-fetch glue*.
- **Tooling maturity:** every piece is boring and stable (Vite, Hono, TanStack
  are all post-1.0, huge ecosystems). Matches the "bulletproof" requirement.
- **Cost:** SEO/SSR for public pages needs a decision (see §5); two deployables
  instead of one (arguably a simplification: web is static files).

### B. TanStack Start (full-stack SSR)
- One framework, SSR built in, same router/query as A.
- **But:** 1.0 was recent; smaller ecosystem, fewer production miles. Chooses
  "newer framework" to escape "framework churn" — the wrong trade under a
  bulletproof-tooling constraint. Revisit in a year; migration from A is small
  (same router).

### C. Astro islands + Hono API
- Excellent for docs/blog/leaderboards (static-first, best-in-class content
  tooling). Awkward for the admin panel and log parser — you'd end up with a
  React SPA inside Astro islands anyway. **Use Astro for the docs/blog site
  only** (see §5), not the app.

### D. Null hypothesis: stay on Next, just harden
- Cheapest. Fix tooling (§6), delete next-intl, replace NextAuth beta when
  stable. Keeps RSC complexity and build times. Legitimate fallback if
  migration appetite disappears — and §6 is shared work either way.

Full UI-framework rewrites (SvelteKit, SolidStart, HTMX/server-rendered) were
considered and rejected: they discard the two biggest assets (the React
component library and the typed tRPC surface) and re-risk the entire feature
inventory for marginal runtime wins.

## 5. Decisions the migration forces

1. **Auth** — the only genuinely tricky part. better-auth has a Discord
   provider and a Drizzle adapter, but its table shapes differ from NextAuth's
   (`users` / `accounts` / `sessions` / `verificationTokens`). Plan: write a
   one-shot migration mapping existing rows (Discord account IDs are the stable
   key); accept that active sessions are invalidated at cutover (users
   re-login with Discord — low pain). Prototype this first; it's the long pole.
2. **SEO/SSR for public pages** (leaderboards, players, blog, docs). Options:
   (a) accept SPA + good meta tags via the API serving an HTML shell per route;
   (b) prerender the handful of public routes at build time; (c) serve
   docs/blog as a separate static site (Astro or fumadocs-core headless) on
   `/docs` behind the same proxy — recommended, since content is MDX on disk
   and gains real speed from being fully static. Community-site SEO needs are
   modest; (b)+(c) covers them.
3. **tRPC: keep or replace.** Keep. It's framework-agnostic (`@trpc/server`
   fetch adapter works on Hono), and 18 routers porting unchanged is the
   difference between a 6-week and a 6-month migration. Dropping superjson or
   moving to oRPC/Hono RPC can happen later, incrementally, behind the same
   client interface.
4. **Redis/MinIO/Postgres: keep all three.** They're the simple part. Changing
   storage during a stack migration doubles the risk for zero user-visible win.

## 6. Bulletproof tooling blueprint

The current gap list (these hold *today*, pre-migration):

- **86 passing unit tests exist and CI never runs them** — `pr-checks.yml` only
  runs typecheck + Biome. Add `bun test` to CI immediately.
- All deps use `^` ranges; no Renovate/Dependabot config; upgrades happen ad hoc
  (and one production dep is a beta).
- Dockerfile base is `imbios/bun-node:latest-current-debian` — an unpinned
  moving tag; builds are not reproducible.
- No e2e tests, no migration-drift check, root `test.ts` is a scratch script
  wired to prod-shaped Redis/DB (delete or move to `scripts/`).

Target CI, per PR (all of it, every time — a check that sometimes doesn't run
is not a check):

```
bun install --frozen-lockfile
biome check .                      # lint + format
tsc --noEmit                       # web + api + core (project refs)
bun test                           # unit: parser golden files, ranked-choice,
                                   #   brackets, cheat flags — already exist
drizzle-kit generate --check       # schema ↔ migrations drift gate
vite build && (api) bun build      # both artifacts must build
playwright e2e (smoke)             # against docker-compose:
                                   #   postgres + redis + minio, seeded;
                                   #   login stub, leaderboard renders,
                                   #   log upload → parse → transcript
```

Policies that make it bulletproof rather than merely present:

- **Exact-pinned versions** in package.json; the lockfile is law
  (`--frozen-lockfile` already used — good). **Renovate** with grouped weekly
  PRs so pins never mean stale; every bump passes the full gate above.
- **No pre-1.0 / beta / RC dependencies in production** — written down as
  policy. (NextAuth beta violates it today; better-auth swap resolves it.)
- **Pin the Docker base image by digest**; multi-stage build; healthcheck
  endpoint per deployable; image built and smoke-tested in CI on main.
- **Env validation at boot** for both apps (keep the zod pattern from
  `src/env.js`, moved to `packages/core/config`), fail-fast with named keys.
- **Golden-file tests for the log parser**: check real (sanitized) log files
  into the repo with expected JSON output. The parser is the most
  domain-critical, most-churned code; golden files make refactors safe.
- Migrations forward-only, applied by the existing `scripts/migrate.ts` pattern
  on deploy, never by hand; `db:push` banned outside local dev.

## 7. Phased migration plan (strangler fig)

Each phase ships independently; the site never big-bang cuts over.

- **Phase 0 — Harden in place** (no stack change): CI runs `bun test`; pin
  versions; Renovate; pin Docker base; delete `next-intl` + root `test.ts`;
  add drizzle drift check. *Prerequisite for everything else.*
- **Phase 1 — Extract `packages/core`**: move `src/lib`, `src/shared`,
  `src/server/db/schema.ts` + services into a workspace package; Next app
  consumes it; tests move with it. Pure refactor, provable by CI.
- **Phase 2 — Stand up the Hono API**: mount existing tRPC routers via fetch
  adapter; port the 12 REST routes; better-auth with the account-migration
  script (prototype this first — it's the long pole). Run behind the proxy on
  `/api/v2`, dark-launched; e2e suite targets it.
- **Phase 3 — Vite SPA**: TanStack Router route tree mirroring `(home)/*`;
  components move mostly unchanged; nuqs → typed search params. Cut over
  route-by-route at the reverse proxy (admin first — zero SEO risk, biggest
  Next-coupling payoff; public pages last).
- **Phase 4 — Docs/blog static site** on `/docs` + `/blog`; OG generation moves
  into the API.
- **Phase 5 — Retire Next**: delete the app, the image loader, superjson-only
  glue; single docker-compose of `api` (Bun/Hono, serving SPA assets or beside
  a CDN) + `docs` static dir + the existing Postgres/Redis/MinIO.

Rollback story at every phase: the proxy flips a route back to the Next app.

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Auth/session migration breaks logins | High | Prototype in Phase 2 before any UI work; stable key = Discord account ID; accept forced re-login |
| SEO regression on public pages | Medium | Prerender + static docs site; verify with crawler snapshot before/after cutover |
| Long-running dual maintenance (Next + new stack) | Medium | Route-level cutover keeps each feature in exactly one place; admin-first ordering front-loads the easy 40% |
| Redis/MinIO behaviors coupled to request lifecycle assumptions | Low-Med | e2e suite runs against real docker-compose services, not mocks |
| Team throughput during migration | — | Phase 0 + 1 deliver value even if later phases never happen |
