# CLAUDE.md

## Approach

- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

## Project

Ranking and challenge-ladder app for Street Fighter 6 (Puello Academy). React Router 8 SPA on
GitHub Pages, backed by Supabase. See README.md for full setup.

## Hard constraints

- **SPA only.** `ssr: false`, served under basename `/pa-webapp/`. There is no server runtime.
  Never add loaders/actions that assume Node, and never `import` server-only packages into `app/`.
- **Only `VITE_`-prefixed env vars reach the browser.** The app needs exactly two:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **The Supabase secret key must never appear in `app/`.** Anything needing it goes in an Edge
  Function under `supabase/functions/`.
- **No `localStorage` for domain data.** All state lives in Postgres. It was migrated out
  deliberately; do not reintroduce it.

## Commands

```bash
npm run dev         # http://localhost:5173/pa-webapp/  (not /)
npm run typecheck   # react-router typegen && tsc
npm run build
```

Run `typecheck` and `build` after changes. Never run dev servers with plain `npm` in a tool that
blocks; use the preview tooling.

## Layout

```
app/lib/        supabase client, auth context, data access per domain, theme + motion tokens
app/components/ tab panels and shared UI
app/routes/     login, forgot/update-password, protected (guard), ranking-sf6 (the app)
supabase/*.sql  migrations, order matters (see README)
supabase/functions/  Edge Functions (Deno, not typechecked by tsconfig)
```

## Conventions

- **UI text, code comments and SQL identifiers are Spanish.** Match it. Type names and
  library-facing identifiers stay English.
- **Colors are Tailwind v4 `@theme` tokens** declared in `app/app.css`: `brand`, `line`,
  `field`, `panel`, `surface`, `danger[-strong|-soft|-muted]`, `success[-soft]`, `info`.
  Never write a hex value in a class. Opacity modifiers work (`bg-brand/15`).
- **Styling goes through `app/lib/theme.ts`**; animation values through `app/lib/motion.ts`.
  Do not inline new durations, easings or hover scales.
- **Mobile first.** One column, two at `lg`. Heights in `dvh`, not `vh`. Touch targets
  `min-h-11 sm:min-h-0`. Inputs 16px on mobile so iOS does not zoom. Buttons need
  `inline-flex items-center` for `min-h-*` to centre their text.
- **Comments explain why, not what.** The codebase has no narration comments.
- Business rules belong in Postgres functions, not in components.

## Security model

Every mutation is a `security definer` Postgres function that starts with `assert_admin()`.
Tables carry `select` policies only; there are no insert/update/delete policies. When adding a
feature, add a function, not a table write from the client.

Nobody may change their own role or delete their own account. That is enforced server-side.

## Database changes

Write migrations as new numbered `.sql` files in `supabase/`. Replacing an existing function
means re-emitting it in full in the new file.

**The user runs the SQL.** Never execute DDL against their database. After they confirm, verify
from outside using the REST API with the publishable key: a table returns `200 []` (exists, RLS
active), an admin-gated function returns `401` with the Spanish message. Do not probe destructive
functions such as `reset_ranking`.

Changing a function signature requires `drop function` of the old one, or PostgREST returns
`PGRST203` ambiguity errors.

`supabase/reset-test-data.sql` restores a clean ranking without touching accounts. Use it
before and after exercising the app, not hand written deletes.

## Verification

Typecheck and build prove compilation only. State plainly what was and was not verified.

**Check `document.visibilityState` before diagnosing any UI bug in the Browser pane.** When
the pane is hidden it gets zero `requestAnimationFrame` callbacks. Motion animations never
complete, so `AnimatePresence mode="wait"` never mounts the incoming child: tab switching
looks broken while state updates correctly. That is an artifact of the pane, not a bug. It
already caused one wrong diagnosis and an unnecessary edit to working code.

Screenshots and synthetic hover also fail while hidden. Measure with `read_page` and
`javascript_tool`, and say that is what was done. Reproduce before editing; do not change
working code on a hypothesis.
