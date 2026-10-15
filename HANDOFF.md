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

## Fixed in PR #7 (user approved)
- **Form customization overwrite:** PatientForm no longer rewrites `config/form_schema`;
  it only seeds it when missing. Both PatientForm and FormBuilder load via
  `mergeWithDefaultSchema` (`src/lib/schema.ts`). Verified in demo mode (old code reproduced
  the bug, new code keeps the inactive flag).
- **Roles:** Kullanıcı Yönetimi now has a role picker (Araştırmacı / Doktor / Yönetici) on
  create and a role dropdown per user; `saveUserRole` writes both `system_users` and
  `user_roles/{firebaseEmail}`; password reset moves the role to the new login email and
  delete removes it. Users created before this fix have no `user_roles` doc until an admin
  picks a role for them in the table.

## Open issues (found, not fixed — ask the user before changing)
1. **Non-admins can't read/write `config/*`** (`firestore.rules` catch-all is admin-only):
   doctors/researchers see the default form (not the customized one) and
   `generateNextResearchId()` (config/patient_counter) fails for them. Needs a rules change.
2. Admin rights for older accounts still rely on hardcoded emails in `firestore.rules`.
3. `src/lib/google-drive.ts` is not imported anywhere (Backup.tsx has its own Drive sign-in).
4. Root folder clutter: one-off scripts/notes from AI Studio (`fix_*.cjs`, `update_*.js`,
   `part_*.txt`, `mide.mht`, `temp_file.xlsx`, …) could be archived or deleted.
5. `README.md` is still the AI Studio template; should describe Firebase setup and deploy.
6. Many unrelated Claude plugins are enabled on the account (domains, Etsy, Zoom, sales,
   video…); their skill descriptions load into every session. User was advised to disable
   the ones this project doesn't need (claude.ai → Settings → Plugins).

## Next steps (proposed, not yet approved)
- Firestore rules: allow signed-in users to read `config/form_schema` and update
  `config/patient_counter`; user must deploy rules.
- Clean up the root folder and rewrite README.

## Notes
- User asked about REA (morluto/rea, reverse-engineering MCP); installation instructions were
  given for their own computer only — it is not installed in this repo.
