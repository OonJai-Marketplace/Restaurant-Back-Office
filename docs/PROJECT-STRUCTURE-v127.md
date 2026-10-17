# Restaurant project, release 127

One Restaurant Supabase project serves the retained Back Office and customer website. Accounting is not a dependency.

- `back-office/index.html`: canonical Back Office page; its layout, forms and business modules are retained. `tools/build-apps.py` generates the root compatibility page, so the existing Back Office URL continues to work.
- `public-restaurant/`: the complete existing public website, optimized local image assets, and public-content loader.
- `pos/`: entry into the existing permission-checked POS workspace.
- `kitchen/`: entry into the existing permission-checked preparation workspace.
- `scripts/`, `styles/`, `assets/`: shared Back Office modules and assets. POS and Kitchen internal extraction remains intentionally deferred; their existing logic is reused.

Administrators manage the public menu and home-page/contact content in **Settings → Public Website**. Photos can be uploaded or added by HTTPS URL. Items can be added, edited, hidden, or marked unavailable. Existing customization choices remain intact. Updates use optimistic version checks and retain the edit form if another session has changed a record.

The 34 existing public items and 20 existing private recipes differ. The migration copies the public catalog into separate public-content records and does not change existing recipes. An administrator explicitly chooses the corresponding recipe. Linked price and availability are maintained from Menus & Recipes, including subsequent changes. Public names, descriptions and photos remain separately editable. Recipe deletion or non-LAK currency changes require unlinking first. No recipe or ingredient details are made public.

Anonymous access is limited to selected public menu columns for visible, available items, and public page/contact content. Only an active administrator can manage the new tables. Private trigger routines are not callable by visitors or staff.

The public page loads current content before restoring its basket, so prices and removed items are rechecked. If the connection fails, it uses a recently saved public menu or the retained built-in menu and asks the customer to confirm current prices and availability. Cart and message handoff behavior are otherwise preserved. The old `/web/` URL checks this release's readiness marker and redirects with its query and fragment; it retains its existing website as a fallback when the new release is unreachable.

## Publication order

1. Review and apply `supabase/migrations/20261017014647_public_storefront127.sql` to Restaurant (`dfrulsnparrouuzjbtih`) only. It creates public-content tables and triggers and seeds the existing public catalog; it does not overwrite private recipes or business records.
2. Verify the public read projection, rejected anonymous private-table access, and preserved private record counts.
3. Merge/publish this Restaurant repository branch. Verify the root Back Office, `/back-office/`, `/pos/`, `/kitchen/` and `/public-restaurant/` routes, and their configuration.
4. Merge/publish the compatibility redirect in the `web` repository.
5. Keep Accounting's installer-only PR separate; it requires no live database migration.

Do not run the old shared-project `sql/` files. The new migration is additive to the standalone foundation and hardening migrations.

## Verification and limits

Run `NODE_PATH=<PGlite dependency directory> node tests/public-storefront127.cjs`, `node tests/standalone-db.cjs`, `node tests/public-runtime127.cjs`, and `python tools/build-apps.py --check`. The public SQL tests use isolated PostgreSQL, not production records. The runtime tests exercise the public loader, caching, data validation and page script syntax. Physical-device UI, recovery email and real Messenger/WhatsApp delivery remain manual verification items. No live messages or orders are sent by these tests.

Release 127 verification results: 57 existing Restaurant database checks, 14 public-content/access/linking checks, and nine public-loader/runtime checks passed. Source syntax, local asset references and generated Back Office entry checks passed. The migration was applied and all three prepared pull requests were merged and published on 17 October 2026. Live public reads and denied anonymous private reads were verified, and existing records were unchanged. The supported browser-control skill is unavailable in this managed environment, so no new browser or physical-device test is claimed. See `ACCESS-AUDIT-v128.md` for the subsequent navigation and role audit.
