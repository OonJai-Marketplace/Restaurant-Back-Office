# Promotions and vouchers · release 147

Open **Back office → Promotions** as an administrator. The studio uses the restaurant's existing database and hosting. Creating banners, uploading Canva exports, issuing vouchers and reviewing requests needs no AI subscription, API credits or paid editor. Existing hosting and storage quotas still apply.

## Create and publish

1. Choose **Create promotion** and a template. Edit the headline, message, colours and photo, or upload a finished image. Preview phone and desktop; download a landscape, square or portrait PNG if useful.
2. Choose an announcement, percentage discount, amount discount or free menu item. Combine minimum spend, eligible items/quantity, total redemptions, uses per phone, channel, dates, daily hours, staff approval and private proof requirements. All selected restrictions must pass. Limits per phone do not verify identity; use approval when identity matters.
3. Choose a top ribbon, hero, offer card, menu banner, popup, slide-in, floating offer or bottom bar. Set click behaviour, page, device, frequency and priority. Select **Make live** or save a draft. Publishing a future start schedules it. Pause stops new use; archive keeps records.

Draft edits do not change a published offer until **Make live** is selected again. Start with one main offer and a quiet announcement. Only one interrupting offer appears per visit, with dismissal and checkout protection. Schedules use Laos time. Use two promotions for a daily window that crosses midnight.

## Issue vouchers

Create a percentage or amount promotion with the required restrictions. Enable **Only redeemable with a registered voucher** if the public must not redeem it without a code. Publish it before distributing codes.

In **Vouchers**, choose the linked promotion, batch name, percentage / fixed discount / stored balance, maximum uses, maximum per use and optional expiry. Generate up to 200 random IDs per batch, or paste your own IDs, one per line. Optionally add a recipient after a comma. IDs are case-insensitive, 6–40 letters/numbers/hyphens; duplicate batches fail without partial issuance. Random codes are preferable to predictable IDs because anyone possessing a valid code can use it, subject to the offer's restrictions.

The register shows issued, reserved, partly used, fully used, expired and disabled vouchers, remaining balance, uses and amounts reserved. Download it as CSV to distribute privately. Disable a lost voucher. Display codes placed on artwork are labels only; register actual redeemable IDs here.

Example: **100,000 LAK balance, 2 uses, 50,000 LAK maximum per use**. A 50,000 + 50,000 redemption exhausts it. A 30,000 + 50,000 redemption leaves 20,000 LAK but exhausts the two uses, so further use is blocked. Reservations do not spend credit; paid POS orders do. One offer or voucher applies per order.

## Customer and cashier workflow

Customers click an offer or enter a voucher in their basket. The server checks current menu prices and all restrictions. They provide a name, phone and any required private proof before confirming. Pending approval displays an estimate and cannot be redeemed. The customer refreshes the request to see the decision; approval does not automatically send a message.

An approved request reserves capacity/credit for 30 minutes. The prepared WhatsApp or Messenger order includes the reference, discount and matching total; the customer chooses whether to send it. A messaging handoff is not proof of payment. Staff open **POS → Offer orders**, locate the reference and open it in POS, then verify and record payment normally. Administrators can also open requests from the studio. Required proof is private to administrators and is removed after review; an hourly cleanup removes expired/unreviewed proof after 24 hours.

For an in-person order, add items in **POS → New Order → Apply promotion / voucher**, then check and apply the offer before saving. Proof-dependent offers use the customer website. Existing unpaid orders must be cancelled and recreated before applying a new offer. Imported offer baskets are locked to their verified items and prices. To change food, cancel and request again; service type, customer and notes remain editable.

Redemption requires an online connection and current menu/recipe readiness. The server records payment, stock and voucher usage together and prevents duplicate retries. Cancellation releases an unpaid reservation. Refunds do not automatically restore voucher balance or use counts; an administrator can issue a replacement voucher after reviewing the refund. Requests do not count as paid sales.

## Assess results

Open **Results & return**, select dates and enter food/packaging/payment costs and campaign spending, including zero when verified. Review or remove a mistaken cost entry. Results show requests, paid orders, net sales, discounts and refunds. Estimated return is net sales minus entered direct costs and campaign spending. Return on spend divides that estimate by campaign spending; it stays blank when costs are missing or spending is zero. Discounts are already deducted from net sales. These are attributed-order estimates, not evidence of incremental profit. Download results as CSV.

## Implementation and verification

Canonical migrations: `supabase/migrations/20261027110508_promotions_vouchers146.sql`, `20261027110512_promotion_proof_scheduler146.sql` and `20261027111445_promotion_proof_retention146.sql`. Their source parts are `sql/15-promotions146.sql`, `16-vouchers146.sql`, `16-promotion-orders146.sql`, `18-promotion-pos-helpers146.sql`, `17-pos-promotions146.sql`, `19-promotion-reports146.sql`, `20-promotion-retention146.sql`, in that dependency order. Apply the three canonical migrations once in timestamp order. They add private tables/RLS, restricted RPCs, a public marketing-image bucket and an hourly proof-retention task; it preserves the existing POS accounting and stock flow.

Run `python tools/build-promotions147.py` after changing the relevant source files. It rebuilds versioned core, settings, POS, bootstrap and worker files without replacing unrelated modules. Local preview fixtures under ignored `dist/qa` are not shipped.

Checks: `node tests/promotions146.cjs`, `node tests/public-runtime127.cjs`, `node tests/readiness144.cjs`, `node tests/sales143.cjs`. Database scenarios in `tests/promotions-db146.sql` run inside a transaction ending in ROLLBACK; they use temporary test menu/order data, exercising canonical prices, duplicate codes, idempotency, both 100,000-LAK balance examples, capacity release, combined restrictions, anonymous access, approval/proof removal, draft isolation and reporting. Do not run that test file outside a rollback transaction.

Release 147 adds audit repairs documented in [PROMOTIONS-AUDIT-v147.md](PROMOTIONS-AUDIT-v147.md). Apply `supabase/migrations/20261027120504_promotion_audit147.sql` after the three release-146 migrations. Customers now confirm their order type; changing it after confirmation requires a new request. Customer names, phone numbers and notes accompany prepared messaging orders. Active requests remain visible even when more than 200 newer records exist. Exported results include estimated return and return on spend.
