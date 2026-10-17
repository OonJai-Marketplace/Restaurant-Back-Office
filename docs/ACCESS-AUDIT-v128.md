# Restaurant access and navigation audit — release 128

The public website remains password-free. Its menu and page content use only the anonymous public projection. Back Office now has a Website area that loads that same complete public document in an iframe, with Refresh and Open full website controls. Public visitors receive no staff navigation or staff session. Messaging links leave an embedded frame on a direct user action.

## Corrections

- One route check now applies to navigation, lazy loading, saved destinations and deep links. Staff do not receive the administrator Overview, Website, or unassigned modules. Search excludes hidden tabs. A user with no assigned tabs receives a clear no-workspace message.
- Staff account status and permissions are rechecked when the app regains focus. A changed assignment signs the user out and clears the visible workspace before re-entry. Server checks enforce revocation independently of the page.
- The POS defaults to live operation from both entry points. Explicit administrator sample-mode preferences are retained; staff use live operation. Fullscreen and management shortcuts respect tab restrictions.
- An empty or invalid tab map no longer gives underlying database access. Order authorization checks the locked order before updates and before returning a repeated-payment result. Online-only permissions cannot modify dine-in orders; New Order staff can continue their own order and safely retry payment.
- Direct POS shift and cash reads are limited to the cashier's own records, with full administrator access. Inventory history is not exposed by a POS-only grant.
- The new worker caches the named Back Office, POS and Kitchen entries and uses the matching offline fallback. Public website requests are excluded from the staff cache.
- User-management responses are ignored if the active account or page changes during the request.

## Verification

The isolated PostgreSQL checks include cooking batches, waste and reversals, stock consumption, duplicate payments, stale edits, receipt paging, restricted roles, public content, recipe linking, and immediate revocation. New access tests cover anonymous visitors, Kitchen-only staff, POS staff, empty grants, order-specific authorization and private cash drawers. Runtime simulations exercise actual route functions, public-page embedding, sample/live defaults, hidden search results and worker fallback behavior.

Commands (PGlite 0.5.8 is required for database checks):

```text
node tests/standalone-db.cjs
node tests/public-storefront127.cjs
node tests/access-db128.cjs
node tests/public-runtime127.cjs
node tests/access-runtime128.cjs
node tests/worker-runtime128.cjs
python tools/build-apps.py --check
```

All database tests use disposable fixtures. No test order or message is sent from production. Browser and physical-device visual interaction, receipt-printer hardware, recovery-email delivery and real messaging handoffs require manual verification; runtime simulations do not claim to replace those checks.

## Deployment

Apply `20261017021956_restaurant_access128.sql` only to the independent Restaurant project, then publish release 128. The migration modifies authorization without changing existing business records or user assignments. Accounting requires no code or database change for this release. Requested staff assignments are separate administrative data operations; personal email addresses and authentication material are not committed to this repository.
