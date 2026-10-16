# Restaurant separation checkpoint

Prepared 17 October 2026 (Asia/Vientiane). This branch is a preparation checkpoint, not a completed migration or a production release.

## Completed

- Created the separate **Restaurant** Supabase project in the existing Oon Jai Marketplace organization, Singapore region, with a quoted project cost of $0/month.
- Prepared an independent database foundation that retains the existing restaurant inventory, recipes, preparation, POS, and permission logic without Accounting schema dependencies.
- Added a repeatable foundation generator and database verification suite. All 55 local checks passed, including anonymous access denial, staff permission boundaries, inactive users, stock correctness, idempotency, and rollback.
- Inspected the existing cross-project dependencies. No Accounting records, live application configuration, or production repository branches have been changed by this checkpoint.

## Paused before migration and release

The connected Supabase tools do not expose Auth URL configuration. Completing that setting requires the Supabase dashboard; switching to browser control requires user permission under the available browser-access rules. The user requested stopping when personal login or permission is needed, without repeated waiting or retries.

In the **Restaurant** project, Authentication > URL Configuration needs:

- Site URL: `https://oonjai-marketplace.github.io/Restaurant-Back-Office/`
- Allowed recovery redirect: `https://oonjai-marketplace.github.io/Restaurant-Back-Office/?password-recovery=1`

These settings have **not** been applied. No passwords, authentication tokens, or business-record exports are stored in this repository.

## Resume sequence

1. Configure and verify Restaurant Auth URLs. Keep Accounting Auth unchanged.
2. Apply only the new standalone foundation to the new Restaurant project. Historical `sql/` migrations assume a shared Accounting installation and must not be applied directly to the new project.
3. Copy the restaurant administrator identity and restaurant business records securely, preserving identifiers and password hashes without copying Accounting sessions or unrelated users. Archive legacy restaurant records privately. Verify source and target counts and checksums before any removal.
4. Replace shared Accounting sign-in behavior with independent Restaurant authentication, remove Accounting navigation, scope offline POS storage to its project, and update the service-worker cache. Preserve the existing layout and business logic.
5. Deploy the staff-management function, verify permissions and browser behavior, then publish the restaurant cutover.
6. Re-read current Accounting source and database definitions before a narrowly scoped cleanup. Accounting is being edited separately; do not overwrite concurrent changes. Preserve financial records, shared audit functions, admin user access, and request hooks. Remove restaurant dependencies only after a verified migration; do not use broad cascading drops.
7. Continue the requested folder-based restaurant application organization and shared content management. The public website currently has no Supabase connection; integrating its different catalog requires explicit mapping rather than overwriting existing recipes.

## Local verification

The new migration was created with Supabase CLI 2.121.0. Its contents are generated using `python tools/build-standalone-schema.py`.

The database tests use `@electric-sql/pglite` 0.5.8 and can be run with `node tests/standalone-db.cjs` after making that package available on Node's module path. Test results and CLI temporary files are intentionally excluded from version control.
