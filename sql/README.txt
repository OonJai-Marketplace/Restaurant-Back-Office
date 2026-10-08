v121 UPDATE: Read ../START-HERE-v121.txt. If the earlier migrations are installed,
apply only 07-restaurant-access-appearance.sql. Do not rerun 01–06 afterward, as
they would restore older guards.

RESTAURANT BACK OFFICE · DATABASE SETUP (STAGED, DO NOT RUN DURING THE ACCOUNTING SPLIT)

This site uses the same Supabase project and existing profiles/auth as Accounting. Its browser connection file contains the same public project URL and publishable/anon key. Do not add a service role key to a browser file.

If the existing v115-v120 database migrations were already applied, do not re-run them merely because this app is in a separate repository. The database is shared.

If a migration is genuinely missing, use the Supabase SQL Editor in order:
01-inventory-menu.sql · catalog tables and separate ingredients. Preserves existing rows.
02-menu-record-actions.sql · menu sales, version checked deletion and shared record guards. This file also guards accounting payroll records and assumes the existing accounting schema.
03-pos-core.sql · POS tables, RLS, functions and stock guard. Assumes the existing profiles and is_admin().
04-pos-offline-guard.sql · replaces the order function with offline replay checks.
05-pos-customization.sql · replaces the order function with option pricing and stock checks.
06-online-menu-import.sql · installs an optional import function. It does not import anything until an administrator presses Import online menu.

Do not run 01 against an unrelated empty database: this bundle expects the current accounting Supabase project and its profiles/auth schema. 03 also registers POS tables with the accounting backup registry when present.

Important limitations held for later work: the public online store is not connected; this Back Office displays manually entered Online Orders through POS. Direct inventory and consignment products and temporary POS products are not yet supported by the current payment function, which accepts menu IDs. Keep this ZIP as the restaurant starting point while Accounting is finished.
