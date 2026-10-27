# Promotion and voucher audit · release 147

Reviewed the promotion studio, public placements, artwork export, voucher issuance and eligibility, private approval, customer checkout and messaging, POS binding/payment, reports and proof retention.

## Repairs

- Banners and cards render on the selected page. Menu offers always target Menu; the editor prevents conflicting page selection. Keyboard access also works when no button label or image is present.
- Status failures, locally expired reservations and paused/disabled offers cannot retain a discounted checkout total or proceed to messaging. Late responses cannot overwrite a different request. A failed cancellation lookup preserves the original request token.
- Order type, customer, phone and notes are retained in the prepared message. Changing the basket or order type after confirmation requires a new request. Messages are only prepared; the customer still decides whether to send them.
- The server rejects missing ordering channels, free items unavailable in POS, and vouchers whose linked offer was changed to an incompatible reward type. Gift lines use canonical option structure.
- A saved POS order cannot have its promotion binding cleared or replaced through the request payload. Cancellation and recreation are required, preserving redemption accounting.
- Voucher forms reject invalid IDs and past expiry dates with readable messages. Percentage fields use the appropriate range. New campaign retries keep the same ID.
- Image exports wrap long words and adapt text to the canvas. They respect photo fit and alignment, and report when the copy cannot fit instead of silently cutting it off.
- Cost saves use a stable ID and disable the save button while pending, preventing duplicate entries on rapid taps or retries. Stale report responses are ignored. CSV results include estimated return and return on spend.
- Active approval requests are loaded separately from the latest 200 records so older active requests remain accessible. POS includes all active requests.
- Proof images are rejected for offers that do not require proof. Administrator-only proof access remains unchanged. The existing hourly cleanup job was inspected and its most recent run succeeded.
- Added a covering campaign/date index for promotion costs. Existing administrator and cashier access policies remain unchanged.

## Validation

64 JavaScript checks passed across:

```
node tests/promotions146.cjs
node tests/promotions-audit147.cjs
node tests/public-runtime127.cjs
node tests/access-runtime128.cjs
node tests/worker-runtime128.cjs
node tests/readiness144.cjs
node tests/sales143.cjs
```

24 database scenarios passed: run `tests/promotions-db146.sql` followed by `tests/promotions-audit147.sql` inside one transaction ending in **ROLLBACK**. These scenarios include both 100,000-LAK voucher examples, payment idempotency, limited capacity, expiry/disable, phone normalization, cancellation, anonymous access, approval, draft isolation, POS binding and report calculation. Never run these fixture scripts outside a rollback transaction.

Browser QA used isolated test fixtures with the real editor and customer scripts. Confirmed menu placement, the explicit order-type selector, a 199,000-LAK basket with 19,900-LAK discount and 179,100-LAK total, and preservation of customer details and notes in the prepared Messenger text. No message was sent. No real payment was taken, and the live administrator sign-in was not used for this test.

Migration: `supabase/migrations/20261027120504_promotion_audit147.sql`, sourced from `sql/21-promotion-audit147.sql`. Rebuild versioned assets with `python tools/build-promotions147.py`. API/table names retain the 146 suffix for compatibility; the application release and cache URLs advance to 147.

## Operating limits retained

One offer/voucher per order; selected eligibility restrictions combine. Reservations last 30 minutes and require online POS payment. Phone limits identify numbers rather than verified people. Refunds do not automatically restore voucher credit. Return estimates depend on entered costs and do not establish incremental profit. These limits are documented in the staff guide and were not silently changed by this audit.
