# HANDOFF — where we left off

_Last updated: 2026-10-15 (claude-code session). Update this file at the end of every session._

## Current state
- `master` is deployed and live (https://gen-lang-client-0381039620.web.app); the live bundle
  includes the latest feature (report conflict highlighting, PR #6).
- Merged so far: Vercel → Firebase Hosting move (#1, #3), Turkish encoding fixes for Excel/CSV
  import and labels (#2, #4), rebuilt patient form with genetics questionnaire and full Excel
  B–DZ coverage (#5), amber highlight of report values that conflict with structured fields (#6).
- `npm run lint` (tsc) is clean. There is no automated test suite.
- Persistent memory set up: `CLAUDE.md`, this file, `.codedna` manifest and CodeDNA headers
  on all 27 app source files (mode: semi).

## Open issues (found, not fixed — ask the user before changing)
1. **Form customization is overwritten.** `src/pages/PatientForm.tsx` `loadData()` writes
   `defaultFormFields` to `config/form_schema` on every form open, so active/inactive choices
   saved in Form Özelleştir (`FormBuilder.tsx`) are lost on the next load.
2. **Roles are never written by the app.** `getCurrentUserRole()` reads `user_roles/{email}`,
   but `UserManagement.tsx` only writes `system_users/{username}` with `role: 'user'`.
   Admin rights currently depend on `user_roles` docs created by the old root scripts or
   the hardcoded admin emails in `firestore.rules`.
3. `src/lib/google-drive.ts` is not imported anywhere (Backup.tsx has its own Drive sign-in).
4. Root folder clutter: one-off scripts/notes from AI Studio (`fix_*.cjs`, `update_*.js`,
   `part_*.txt`, `mide.mht`, `temp_file.xlsx`, …) could be archived or deleted.
5. `README.md` is still the AI Studio template; should describe Firebase setup and deploy.
6. Many unrelated Claude plugins are enabled on the account (domains, Etsy, Zoom, sales,
   video…); their skill descriptions load into every session. User was advised to disable
   the ones this project doesn't need (claude.ai → Settings → Plugins).

## Next steps (proposed, not yet approved)
- Decide and fix issues 1 and 2 (likely: only seed `config/form_schema` when missing; write
  `user_roles/{email}` when an admin creates or edits a user).
- Clean up the root folder and rewrite README.

## Notes
- User asked about REA (morluto/rea, reverse-engineering MCP); installation instructions were
  given for their own computer only — it is not installed in this repo.
