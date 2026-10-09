LOCAL FIXTURE VALIDATION — NO LIVE DATABASE WRITES

From this tests folder: npm install
For browsers: npx playwright install chromium --only-shell
Run: npm run test:db, npm run test:pos, npm run test:browser
Layout: npm run test:layout, npm run test:layout:touch, npm run test:accounting
Set RESTAURANT_CHROMIUM_PATH to use a locally installed compatible Chromium.
The browser fixture serves 127.0.0.1:8765, intercepts remote requests and mocks Auth.
Database tests use an isolated PostgreSQL-compatible PGlite instance.
Priority and permissions: npm run test:priority, npm run test:runtime
Browser suites must run sequentially, except priority uses its own port 8766.
Database test:db also runs priority-db125.cjs after the original fixtures.
Results and screenshots go under tests/results. They are not production tests.
