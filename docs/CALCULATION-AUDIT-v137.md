# Restaurant calculation and integration audit — v137

## Verified defects corrected

- Bulk-planner batch factors and summaries now use selected substitutions and bundle component quantities. Changing a customization updates the displayed factor immediately. Bundle portions must be edited through their component recipes rather than silently saving an unchanged recipe.
- Nested preparation costs are evaluated in production order. A parent uses the planned child's ingredient cost, actual yield and accumulated labor/utilities, matching sequential database recording. Missing or invalid child costs remain incomplete.
- Whole-batch rounding retains small positive requirements while tolerating ordinary floating-point noise at an integer boundary. Nonfinite stock cannot erase requirements.
- Editing a prepared ingredient's stock conversion updates ingredient cost, purchase basis and full preparation cost in the new recipe unit. Relinking to raw inventory removes the previous cooking surcharge metadata.
- Inventory and POS stock reads retrieve all result pages. The catalog is committed to memory only after the complete read succeeds; interrupted reads and responses from a superseded session cannot publish a partial balance. Equal-time incoming-cost selection uses the same ID tie-break as the server.
- Catalog saves and reloads invalidate the previous bulk plan. Preparation previews reject empty inputs, invalid cost methods, excessive estimated surcharges and overflowing costs. Missing stock conversions must be supplied explicitly.
- Release 137 updates the application loader and offline worker to deliver the corrected code together.

## Verification

Synthetic regression fixtures cover calculation boundaries, customization, bundles, unit-cost conversions, more than 1,000 ledger rows, interrupted reads and account changes. The database fixture also compares nested planner totals with sequentially recorded preparation batches.

Existing database and runtime checks cover preparation/POS stock deductions, refund costs, waste correction, duplicate submissions, permission isolation, shared public/POS prices, channel visibility, phone-oriented planner controls and offline assets.

Read-only checks against the current private catalog exercised all 13 complete bakery recipes and combined all nine shared-dough menus while retaining each menu's fillings. Private workbook contents and recipe quantities are not included in this repository.

No production stock, sales, recipe quantities, database functions or permissions were changed by this release. Database transaction tests use isolated fixtures. Physical phone/iPad rendering and interaction were not verified in this session.

## Remaining integration work

- Four bakery recipes still have explicit source-review issues requiring confirmed quantities, yield or price. Their complete costs must remain unavailable until those inputs are resolved.
- Thirty-four public menu items still have no base recipe quantities. Their public/POS price links are present, but reliable stock deduction and food-cost calculations require ingredient and customization portions.
- Saved shared-preparation overhead inputs are currently empty. Full baking cost requires actual worker minutes, labor rate, fuel/electricity and other batch costs. Ingredient-only totals cannot establish those missing operational costs.
- Separate reads across devices are not a single database snapshot. Recording remains subject to the existing server stock, version and permission checks. A future aggregate stock endpoint would reduce ledger transfer as history grows.
