# Public website / back-office boundary review

Reviewed 27 October 2026 (Asia/Vientiane). Release 148.

## Result

The database access boundary passed the targeted checks. Sharing this repository does not itself grant customers access to restaurant data. However, the two applications currently share the browser origin `https://oonjai-marketplace.github.io`. Different URL folders and different local-storage key names do **not** create a browser security boundary.

This release strengthens the embedded preview and blocks framed staff startup. It does **not** establish complete isolation between the top-level public site and the back office. A script compromise on another page at the same origin could still access origin-wide browser storage, including a saved staff session on that browser. No actual compromise or historical data leakage was established by this review; this was an access-control assessment, not incident forensics or a complete penetration test.

## Repairs

- The back-office Website preview now uses `sandbox="allow-scripts allow-forms allow-popups"` without `allow-same-origin`, top navigation, or popup sandbox escape. It cannot read the parent staff page or its storage. The toolbar directs staff to the full public website for checkout and external destinations; preview state is temporary.
- Staff HTML stops before loading the application or registering its worker when framed. The authentication module independently refuses framed initialization. These are application safeguards, not an HTTP `frame-ancestors` policy.
- Public form initialization now uses cryptographically secure `getRandomValues` UUIDs. This avoids an unavailable `randomUUID` stopping menu refresh in an opaque-origin preview. No weak-random fallback was introduced.
- The existing staff session key, sign-in method, POS bundle, financial calculations, database permissions and production records are unchanged.

## Database evidence

`tests/boundary-db148.sql` passed 34 result assertions against the deployed Restaurant database, inside one transaction ending in rollback. A follow-up query found zero temporary test accounts.

- All tables in the public schema have row-level security enabled. Anonymous visitors have no direct table insert/update/delete/truncate grants.
- Actual anonymous SELECT attempts were denied on 23 private tables, including profiles, staff assignments, inventory, recipes, POS orders and cash drawers, sales plans, voucher registers, claims and approval proof, campaign drafts and promotion costs.
- Public menu columns, page content and live promotions remain readable; the internal menu-to-recipe linkage is not publicly selectable.
- Only the quote, request and token-protected status RPCs are anonymously executable in the public schema. Anonymous POS snapshots and voucher-register calls are denied. An unrelated request token does not return customer details.
- An active signed-in fixture with no assignments cannot read the tested business records, call the POS snapshot, promote itself, or change its permissions. User-editable metadata declaring an administrator role does not grant administrator access.
- A legitimate POS assignment works; disabling that membership blocks access with the same simulated JWT identity.
- The existing `restaurant_active_user` policies are RESTRICTIVE guards. They do not override the finer permissions. Existing restrictive POS policies limit orders, shifts and cash records.
- The promotion image bucket is intentionally public and permits JPEG/PNG/WebP uploads by administrators. Approval photos are held in the private claims data, not this public bucket.

The Supabase advisor also reported an existing disabled compromised-password check, intentional staff-callable privileged functions, and inaccessible legacy tables with RLS but no policies. An advisor warning alone is not proof of unauthorized access. Auth configuration and unrelated legacy data were not changed.

## Application verification

49 JavaScript checks passed: access runtime (9), current release worker runtime (7), new boundary tests (7), public runtime (9), promotion rendering/rules (7), and promotion checkout regressions (10).

Browser verification showed the sandbox denying same-origin parent/child document access, staff frames displaying the separate-tab message, the ordinary top-level sign-in page loading, and public menu navigation and basket controls remaining usable. The live public page was checked in the sandbox. The managed HTTP preview required a test-only document with the same current scripts inlined because its asset gate rejected opaque-origin subrequests; that fixture was not published. After the UUID fix, the isolated fixture successfully refreshed the real public menu. No message, payment or real customer order was submitted. Actual staff credentials were not used.

The worker continues to exclude public-site paths and external database/auth calls from staff shell fallback. Public requests use the publishable key, not a staff session. A targeted source scan found no embedded secret/service-role key or private-key block; this is not an exhaustive Git-history secret audit.

## Remaining separation work

For a stronger boundary, deploy the public website and staff application to **different hostnames/origins**, with separate build outputs and deployment permissions. Two repositories under the same GitHub Pages account hostname would still share an origin and would not solve this issue.

At that cutover, update staff password-recovery redirects, move the staff session to the new origin, expire old sessions, remove the old staff application entry, retain a sandboxed customer preview, and test login, POS and promotion handoff again. Use a host capable of enforcing HTTP Content-Security-Policy (including `frame-ancestors`) and appropriate security headers. The apps can retain one source repository and a database with carefully enforced roles; separate databases are not necessary merely because one interface is public.

The shared database and shared hosting remain common availability dependencies. These repairs do not isolate hosting outages, capacity exhaustion or a compromised deployment account. The destination hostname and hosting setup have not been selected or changed in this release.

References: [browser origins](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy), [iframe sandbox rules](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe), [Supabase grants and row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
