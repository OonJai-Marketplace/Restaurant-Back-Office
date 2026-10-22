# Sales & Profitability — release 143

Administrators can open **Sales & Profitability** from Back Office or the Home reports link. The established shell, login appearance, menu editing and checkout remain in place. The new module loads only when opened.

## Available views

- Overview: complete paginated POS receipt periods, equal-length previous-period comparison, sales and ingredient contribution graph, average order and daily CSV.
- Menu performance: quantity, sales, contribution, best/lowest seller bars, search, category/sort controls and CSV. Bundles count once as the sold product. Current availability is shown; historical availability is not recorded.
- Promotion planner: selected real menu items, percentage/LAK-off/final-price scenarios, tax/packaging/fee assumptions, separate loss/break-even/below-target/incomplete states, maximum discount at the chosen margin, required volume uplift and CSV. Scenarios save to an administrator-only table with optimistic concurrency.
- Campaign comparison: selected versus previous equal-length period, with optional extra campaign spend. This is a period comparison, not campaign-attributed causal lift.
- Restaurant returns: entered period overhead and invested capital produce estimated operating result, period ROI and break-even sales. Accounting integration and cash payback history are not available; the UI states this explicitly.

Saving a scenario does not modify menu prices or activate customer promotions. Percentage/LAK/final-price offers apply per selected item, not per basket. The existing 65% ingredient-margin policy is unchanged; the new adjustable contribution target is separate.

## Data and accounting basis

All amounts in this workspace are LAK. No implicit FX conversion is performed. Fees, packaging and tax are user-entered assumptions, initially zero. Fees may use original or discounted selling price and are assumed nonrefundable. Net sales exclude selected included tax. Contribution deducts frozen standard ingredient cost, packaging and selling-fee assumptions; it excludes general overhead.

The database captures `lines[].cost143` server-side when an unpaid order becomes paid. Recursive bundle recipes and selected option recipes use the ingredient costs saved at payment. Missing recipes, price/unit reviews and mixed currencies return an unknown cost. Frozen snapshots are preserved when receipts are refunded; no old receipts are backfilled from current prices.

Only paid/refunded, synced POS receipts count. Refunds restate the original payment date, matching the existing report convention. Non-restocked refunds retain ingredient consumption. Receipt discounts are allocated proportionally with residual cents reconciled to the receipt total. The separate manually imported menu-engineering sales table is not added to POS sales, avoiding duplicate totals. External online orders appear only when recorded and paid in POS.

On 22 October 2026 the connected Restaurant database had no paid receipts and 34 active LAK menus without saved recipe quantities. Consequently, the production page correctly begins with empty sales and incomplete menu costs. No demonstration sales or ingredients are inserted.

## Setup and build

- Database: `supabase/migrations/20261022020505_sales_profitability143.sql` (also available as `sql/13-sales-profitability143.sql`). Additive schema only. Applied to the Restaurant project, not Accounting.
- Build: `python3 tools/build-sales143.py`. Rebuilds the core 143 bundle and both entry pages; the 142 login/shell CSS and POS/inventory bundles are retained.
- The new service worker and core filenames prevent an older cache from hiding this release.

## Validation

- 15 financial calculation checks: discounts, fee basis, included tax, target floor, missing data, rounding, refund/restock, snapshot stability, duplicate/offline exclusion, ROI and empty data.
- 8 focused database checks: administrator RLS, staff/anonymous denial, scenario versions, server snapshots, immutable historical costs and private-function permissions.
- Existing standalone schema/POS/inventory suite: 57 checks passed.
- Existing home-report suite: 6 checks passed; recipe calculation suite: 12 passed.
- Browser checks use the actual built entry page and local fixtures, with external requests blocked. Cover routing, lazy loading, empty data, discounts, filtering, saving, invalid input, phone/desktop layout, administrator access and logout cleanup.
- Production read-only verification: new RLS enabled, snapshot trigger enabled, zero client-callable new private functions, zero scenario seed records.

Security advisors reported no findings for the new 143 objects. Existing RPC exposure and password-protection configuration notices remain outside this feature's scope.
