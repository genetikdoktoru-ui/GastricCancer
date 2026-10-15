# CLAUDE.md

GastroGen Tıbbi Portalı — a research registry for hereditary/sporadic gastric cancer
(clinical, pathology and germline genetics data). React 19 + Vite + Tailwind 4 SPA, Firebase
Auth + Firestore, Express API that proxies Google Gemini. Live at
https://gen-lang-client-0381039620.web.app (Firebase project `gen-lang-client-0381039620`).

## Start here (saves tokens)
1. Read `HANDOFF.md` — current state, open issues, next steps.
2. Read `.codedna` — package map and recent agent sessions.
3. Before opening a source file, read only its first ~8 lines: every app file starts with a
   CodeDNA header (`exports:` / `used_by:` / `rules:` / `agent:` / `message:`). Respect `rules:`.
4. After editing a file, keep its header accurate; append an `agent:` line for significant
   changes (keep the last 5). At session end, update `HANDOFF.md` and add an
   `agent_sessions:` entry to `.codedna` (keep the last 5).
   Do not put model identifiers in any repo file — use `claude-code` as the agent name.

## Working with the user
- The user writes in Turkish and is a medical geneticist (NGS/WES/WGS, EHR data) with no
  coding background. Reply in Turkish, explain in plain language, keep jargon minimal.
- All UI text is Turkish. Preserve Turkish characters (İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç) exactly.

## Commands
- `npm install` — dependencies (not preinstalled in cloud sessions).
- `npm run lint` — `tsc --noEmit`; the only automated check (no test suite). Must stay clean.
- `npm run dev` — Express + Vite middleware on http://localhost:3000.
- `npm run build` — client to `dist/client`, server bundle to `dist/server.cjs`.
- `npm run build:functions` — bundles `src/server/app.ts` to `functions/lib/app.cjs`.
- Deploy: `firebase deploy` (hosting predeploy runs the build). Only the user deploys.

## Architecture
- `src/App.tsx` — auth gate (`<Login/>` when signed out) + routes; `src/components/Layout.tsx` — sidebar.
- `src/pages/*` — one component per route. Biggest: `PatientForm.tsx`, `PatientAnalytics.tsx`, `ExcelImport.tsx`.
- `src/lib/schema.ts` — `defaultFormFields` (~180 fields). Field `id` = Firestore key; never
  rename/remove without a data migration. Label prefix `(X)` = source Excel column letter.
- `src/lib/codebook.ts` — numeric Excel codes → labels (e.g. `1` → `1 - Erkek`).
- `src/server/app.ts` — `/api/gemini/*` routes. Runs as ESM in dev (tsx) and CJS in prod
  (esbuild → Cloud Function). Firebase Hosting rewrites `/api/**` to the `api` function.
  New server dependencies must also be added to `functions/package.json`.
- Gemini key: user's own key from localStorage via `x-gemini-api-key` header, else env
  `GEMINI_API_KEY` (`.env.local`, git-ignored).

## Firestore (named database `ai-studio-60a9e196-…`, see `src/lib/firebase.ts`)
| Collection | Content |
|---|---|
| `patients` | pseudonymized research records (research_id `GST-NNN`), `createdBy` = owner email |
| `patient_identities` | REAL name / national ID ↔ researchId — sensitive (KVKK) |
| `config/form_schema`, `form_schemas` | active form schema / saved templates |
| `config/patient_counter` | atomic counter for `GST-NNN` (`src/lib/idGenerator.ts`) |
| `system_users`, `user_roles` | username→email mapping / role (`admin`, `doctor`, else researcher) |
| `audit_logs` | append-only audit trail (`src/lib/audit.ts`) |

`firestore.rules`: admins see everything; others only docs where `createdBy` is their email.

## Rules
- Never send identity fields (name, national ID, contact) to Gemini or into `patients`.
- Parse uploaded Excel/CSV only through `readWorkbookFromBuffer` (Windows-1254 CSV fix).
- Never write to the real Firestore from a cloud session. To see the UI, run Vite with
  aliases that replace `firebase/app`, `firebase/auth`, `firebase/firestore` with in-memory
  stubs (fake admin user, a few fictitious patients), then screenshot with Playwright
  (`npm root -g`/playwright, Chromium at `/opt/pw-browsers`). Keep stubs and config outside
  the repo (e.g. config under `node_modules/.demo/` so `vite` resolves).
- Root-level `fix_*.cjs`, `update_*.js`, `part_*.txt`, `*.mht`, `temp_file.xlsx` are one-off
  leftovers from earlier AI Studio sessions — not used by the app. Don't edit or run them.
