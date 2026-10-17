# Restaurant layout v130

18 October 2026, Asia/Vientiane.

- Unified the header tools and navigation across phone, tablet and desktop. Removed the floating bottom/right toolbar, its reserved gutter, the moving tablet logo button and the repeated Overview tab. Added a drawer close button, keyboard focus containment and focus restoration.
- Preserved restaurant branding with compact banners, removed repeated POS and website titles, and kept section/settings/POS tabs on horizontally scrollable rows.
- POS layout responds to the available workspace width, accounting for the sidebar. Narrow workspaces stack catalog and order; the catalog has a bounded scrolling area so the order remains reachable. Wide workspaces show both columns with a sticky order panel.
- Made forms, summary cards, action rows, recipe rows and dialogs adapt to narrow screens. Touch inputs use 16px text and controls have larger targets. Wrapped wide tables in keyboard-accessible scroll regions. The embedded website fills the remaining workspace height.
- Release 130 refreshes cached application assets. POS/Kitchen redirects, permissions, database configuration, public content and business calculations are preserved.
- Header synchronization writes only changed visibility and badge values, avoiding a recurring observer update after moving tools into the app header.

Verification: 48 runtime assertions/checks passed across layout navigation (9), access (9), service-worker routes/assets (6), offline assets/deadlines (10), POS setup (5), and public website integration (9). Shell markup and JavaScript syntax checks passed. An obsolete runtime test was updated from the retired v119 worker to the current v130 worker and versioned cache URLs.

Browser regression expectations were updated for the new header, but visual browser suites were not run: this managed environment does not expose the required control-browser capability. Actual pixel layout and physical phone/tablet behavior remain unverified.
