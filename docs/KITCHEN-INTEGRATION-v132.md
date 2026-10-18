# Restaurant layout, login and kitchen integration — v132

Restaurant login uses Accounting's current 430px card, 28px desktop / 20px phone padding, 52px logo, 43px fields, and the same 66px circular loading animation. Authentication and initial workspace preparation share one loading job. Required password changes remain accessible, and a signed-out or replaced session cannot reveal an earlier user's workspace. Accounting sources were read only.

The sidebar has one Point of Sale entry; Online Orders remains within POS → Sales. Open/Close Shift and Sync are inline with the main POS tabs. Phone staff banners are hidden, setup warnings collapse, category filters scroll horizontally, menu recipe expanders are readable cards, Inventory metrics reflow, and calculation dialogs have a high-contrast labeled close button. Tablet and desktop retain their navigation and larger layouts.

## Where to find the tools

- **Menu → Integration → Ingredient links**: inventory mapping and explicit conversion factor for each ingredient; links to menu serving quantities, customization portions and recipe costing.
- **Menu → Integration → Usage & food cost**: net sales, ingredient cost of sales, full prepared cost, recorded POS stock use, current-recipe comparison and separate wastage. Payments and refunds use their own event dates in Asia/Vientiane. The report returns aggregates without customer/cashier details.
- **Kitchen → Bulk Calculator**: saved shared preparation recipes (for example dough), usable yield, ingredient quantities and labor/utility inputs; aggregate requirements across several products; optional existing stock and whole-batch rounding; nested preparation order, raw requirements and stock shortfall.
- **Kitchen → Preparation & Costs**: review calculated inputs and actual yield before recording a batch. Preparation consumes raw stock and receives prepared output. Menu portions then consume that prepared output once.
- **Kitchen → Wastage**: existing durable capture, batch costing, unit conversion and correction controls.
- **Menu → Costing & Promotions**: existing per-item costing and formula explanation.

Bulk previews do not mutate stock. Recording uses the existing idempotent preparation endpoint and offline capture queue. Formula edits use version checks and Kitchen preparation permissions. Integration follows Menu recipe access, with ingredient edits still requiring their own edit permission. Kitchen can read the production recipe catalog without receiving POS/customer access.

Sale-cost snapshots begin with this release; old costs are not backfilled from today's prices. Historical rows without cost snapshots display incomplete costs. Current recipe comparison is not a physical stock count, and recipe changes or refunds without restocking can produce differences. Raw production consumption is not charged again as sold prepared stock.

The existing 34 imported public menu recipes still need actual serving quantities, purchase costs and Inventory links; no weights, formulas or stock were fabricated. Existing shared public/POS prices and independent channel visibility remain intact.

## Validation

Passed: 15 bulk calculation tests, 12 integration database tests, 8 login/layout checks, 57 standalone database checks, 12 access database checks, 14 shared catalog checks, and 58 existing UI/runtime checks (shared menu, offline worker, access, request deadlines, public menu, responsive navigation and POS setup).

Coverage includes aggregation before rounding, g/kg conversion, nested preparations/cycles, missing data, choice replacement, refunds, immutable costs, optimistic versions, permission isolation, no repeated raw-stock deduction, duplicate hydration, interrupted sign-in, cache asset installation and public-site separation. A pre-existing date-sensitive export fixture now uses the restaurant's Asia/Vientiane date instead of the test host's date.

Rendered browser/device QA is unavailable in this managed session. Source and runtime checks do not establish pixel-perfect rendering on a physical device.

Security advisor baseline retains the existing permission-gated public RPC notices and leaked-password setting. This release introduces no public SECURITY DEFINER function. References: [function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
