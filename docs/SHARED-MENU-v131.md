# Shared menu and channel display — v131

The public restaurant menu and live POS now use one administrator-managed sales catalog. The 34 original public products retain their original names, prices, descriptions, photographs, and five Build Your Own configurations. The back-office recipe records keep private quantities, ingredient costs, and Inventory links.

In **Settings → Menu Display**, edit an item and choose **Show on public website** and **Show in POS** independently. **In development** and **Archived** override both channels without deleting the item or losing its selected channels. New items default to development with both channels off. Existing private recipes appear in this area as unpublished development records; choose a category and channels when adopting them into the shared sales catalog. Existing unrelated private records are retained, and live POS offers only adopted shared items.

Visibility controls appear first in the editor. Responsive item cards replace the wide management table. Cashier customization uses touch tiles with checkbox/radio semantics, selection counts, limits, included portions, and live totals. Wellness choices use radio tiles. Extra vegetables and proteins retain the original 7,000 LAK charge. The server continues to determine order prices and reject invalid selections. Background catalog refresh updates the selling screen when a shared item changes.

The storefront record is the sales authority. A transactional trigger updates its linked private menu record. Recipe editing preserves those shared sales fields; common fields are edited through Menu Display. Existing private option mappings are retained by option ID, and pre-adoption customization definitions are retained under `legacyPosOptions131`. Original option definitions are shared by the public script and the database transformation, with parity tests covering every choice.

## Database rollout

Migration `public_pos_catalog131` was applied to the Restaurant project `dfrulsnparrouuzjbtih`. The administrator-only `pos_sync_public_catalog131()` imported 34 products and 5 builders. Production verification found all 34 names, prices and descriptions matching, with all 34 original products enabled in both channels. No Accounting project changes were made.

The import adds missing ingredient names without inventing weights, costs, purchase conversions, or stock. All 34 newly linked recipes require actual serving quantities and Inventory links before payment. Unpaid orders and customization are available. Existing receipts and stock history are retained.

## Verification

155 database and runtime checks passed across shared catalog (14), shared UI (10), storefront (14), standalone database (57), access database (12), and existing runtime suites (48). These include independent visibility, archive/development overrides, authoritative prices, extras, unknown choices, idempotent synchronization, private recipe retention, role restrictions, public-column privacy, mobile/tablet navigation, and offline shell asset installation.

Visual browser review was unavailable in this managed session. CSS and interaction checks are not a substitute for rendered-device QA.

The security advisor reports the existing intentional, permission-gated SECURITY DEFINER RPCs and the existing leaked-password-protection setting. No new public definer RPC was introduced; synchronization is invoker-based, and the private retention trigger has no client EXECUTE grants. Reference: [function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
