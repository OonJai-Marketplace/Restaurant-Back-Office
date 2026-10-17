# Restaurant separation checkpoint

Prepared 17 October 2026 (Asia/Vientiane). This branch is a preparation checkpoint, not a completed migration or a production release.

## Completed

- Created the separate **Restaurant** Supabase project in the existing Oon Jai Marketplace organization, Singapore region, with a quoted project cost of $0/month.
- Prepared an independent database foundation that retains the existing restaurant inventory, recipes, preparation, POS, and permission logic without Accounting schema dependencies.
- Added a repeatable foundation generator and database verification suite. All 55 local checks passed, including anonymous access denial, staff permission boundaries, inactive users, stock correctness, idempotency, and rollback.
- Inspected the existing cross-project dependencies. No Accounting records, live application configuration, or production repository branches have been changed by this checkpoint.

## Authentication and database copy verified

On 17 October 2026 the administrator completed dashboard sign-in. The Restaurant Site URL and exact password-recovery redirect were saved and verified:

- Site URL: `https://oonjai-marketplace.github.io/Restaurant-Back-Office/`
- Recovery redirect: `https://oonjai-marketplace.github.io/Restaurant-Back-Office/?password-recovery=1`

The standalone foundation and guard-hardening migrations are applied to Restaurant. One administrator identity, its email sign-in, and the minimal profile were copied with the existing password hash. Accounting sessions and unrelated users were not copied. All copied fields matched exactly; no user references were broken. The new project keeps its own signing keys.

The copy contains 78 active restaurant records and preserves 6 legacy records in a private archive; the minimal migrated profile is also archived. Recipes, staff profiles and the staff-management function reject anonymous requests. No Accounting data has been removed yet.

The application changes use Restaurant-only authentication and project-scoped offline POS storage. Previous offline queues remain on the device and are flagged for export and review, without automatic replay. The release loader waits for the new service worker before loading configuration. The existing layout and business calculations remain intact.

Validation: 57 local database checks, 38 cashier/permission checks, 13 separation checks in Chromium and 13 in WebKit, and 5 real service-worker upgrade/offline reload checks passed. Physical iPhone testing and recovery-email delivery have not been performed.

Security advisors: trigger-function execution and mutable search paths were corrected. The remaining SECURITY DEFINER notices concern deliberately exposed, permission-checked restaurant RPCs covered by the permission tests. Leaked-password protection is not enabled on this project.

No passwords, authentication tokens, or business-record exports are stored in this repository.

## Remaining cutover sequence

1. Publish and verify the prepared Restaurant application cutover.
2. Historical `sql/` migrations assume a shared Accounting installation and must not be applied directly to the new project.
3. Re-check source records against the verified copy immediately before removing restaurant records from Accounting. Stop if either side changed.
4. Replace shared Accounting sign-in behavior with independent Restaurant authentication, remove Accounting navigation, scope offline POS storage to its project, and update the service-worker cache. Preserve the existing layout and business logic.
5. Deploy the staff-management function, verify permissions and browser behavior, then publish the restaurant cutover.
6. Re-read current Accounting source and database definitions before a narrowly scoped cleanup. Accounting is being edited separately; do not overwrite concurrent changes. Preserve financial records, shared audit functions, admin user access, and request hooks. Remove restaurant dependencies only after a verified migration; do not use broad cascading drops.
7. Continue the requested folder-based restaurant application organization and shared content management. The public website currently has no Supabase connection; integrating its different catalog requires explicit mapping rather than overwriting existing recipes.

## Local verification

The new migration was created with Supabase CLI 2.121.0. Its contents are generated using `python tools/build-standalone-schema.py`.

The database tests use `@electric-sql/pglite` 0.5.8 and can be run with `node tests/standalone-db.cjs` after making that package available on Node's module path. Test results and CLI temporary files are intentionally excluded from version control.

## Prepared continuation — release 127

The Accounting fresh-installer fix is prepared in PR #9. Restaurant folder entry points and public-content management are prepared on `codex/restaurant-public-integration-127`; the legacy website redirect is prepared separately. See PROJECT-STRUCTURE-v127.md for the exact scope and ordered publication steps. These continuation changes are not yet live: automatic approval review blocked direct default-branch publication. The prior separation release remains live.
