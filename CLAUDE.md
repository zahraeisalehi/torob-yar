# ترب‌یار (Torob-yar): CLAUDE.md

Hackathon project: an AI assistant for **in-person** shopping in Tehran, built on Torob's dataset of shops, products and offers.
Flow: find the right product (voice/chat + generative comparison cards) → map of nearby shops → the agent verifies price/stock/hours with the shop → the user goes to buy.

**Judging (300 pts):** Product 75 · **UX 75** · Intelligence 50 · Deployment 40 · Technical 40 · Dataset 20.
UI/UX comes first. A working UI with no backend still beats a backend with no UI.

## Source of truth: read before working on a feature
- `docs/UI_SPEC.md`: every screen, state, animation and Persian copy string. Follow it exactly; if you must deviate, say so.
- `docs/DATA.md`: dataset facts, parsing rules, derived tables, size budget.
- `docs/vendor/boxapi.md`, `docs/vendor/liara.md`: vendor facts that differ from your training data. Trust these over memory.
- `docs/design/ref/torob-desktop.png`, `torob-mobile.png`: the visual reference. Look at them before any styling work.

## Stack (decided; don't swap)
Next.js (App Router, TypeScript, `output: 'standalone'`) · Tailwind + shadcn/ui · Framer Motion · vaul (bottom sheet) · zustand · Vercel AI SDK + `@ai-sdk/openai-compatible` → BoxAPI · MapLibre GL · better-sqlite3 (FTS5) · zod · Vazirmatn via `@fontsource-variable/vazirmatn` (no Google Fonts; the server is in Iran).
No Google APIs. No Neshan yet (geo = seeded placeholder behind `GeoProvider`, UI_SPEC §3.4).

## Non-negotiables
- Persian, `dir="rtl"`, logical Tailwind properties only (`ms/me/ps/pe/start/end`), Persian digits in the UI.
- Mobile-first, and desktop equally polished. Check every screen at 390×844 and 1440×900.
- `DATA_SOURCE=fixtures` must always give a complete working demo with no API key and no SQLite.
- Never show an empty or dead-end screen: skeletons, inline retry, nearest-relaxation suggestions.
- Be transparent about data: listed price vs verified price vs stock vs freshness, and `نامشخص`/`تقریبی` when unsure.
- The backend is minimal and serves the UI only. Same JSON shapes as the fixtures.
- Secrets only in env. `.env.local` is gitignored; keep `.env.example` up to date.

## Working agreement: AUTONOMOUS MODE
- **Never ask the user anything and never wait for confirmation.** The user is away. When a choice comes up, pick the option that best serves the demo (UX first, then reliability), write it to `docs/DECISIONS.md` (date, decision, why, how to undo), and continue.
- **You do all git work:** commit after every milestone (and before any risky change) with a clear conventional message. Push only if an `origin` remote exists. Never force-push, never rewrite history, never commit secrets or `data/raw`.
- **You run the Liara CLI yourself** (the user is already logged in). Discover flags with `--help` first. Never delete Liara apps, disks or networks.
- After each milestone: run `npm run typecheck && npm run lint && npm run test:e2e`, fix failures, update `docs/PROGRESS.md`, commit.
- If something is truly impossible (missing credential, paid action refused), log it in PROGRESS.md under "Blocked", take the documented fallback, and keep going with everything else.
- Use vim, not nano, when an editor is needed.

## Commands
`npm run dev` · `npm run build:db` · `npm run build:fixtures` · `npm run doctor` · `npm run typecheck` · `npm run lint` · `npm run test:e2e`
