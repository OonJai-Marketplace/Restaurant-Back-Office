// Synthetic cashier and display. Internet endpoints are blocked. The native
// transport is mocked here; the separate node test exercises the TCP transport.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../www');
const server = http.createServer((req, res) => {
  let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (file.endsWith('/')) file += 'index.html';
  try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'); res.end(fs.readFileSync(file)); } catch { res.writeHead(404); res.end('Missing'); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), headless: true, args: ['--no-sandbox'] });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    await context.route(/^https:\/\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    const host = await context.newPage(), display = await context.newPage(), errors = [], pending = new Map();
    let available = true, serial = 0;
    for (const page of [host, display]) page.on('pageerror', error => errors.push(error.stack));
    await host.exposeFunction('nativeReply', ({ id, payload }) => { pending.get(id)?.({ payload }); pending.delete(id); });
    await host.addInitScript(() => {
      window.oonjaiDesktop = { start: async () => ({ addresses: ['192.168.1.8'], port: 19741 }), stop: async () => ({}), reply: args => window.nativeReply(args), addListener: async (_name, callback) => { window.testIncoming = callback; return { remove() {} }; } };
    });
    await display.exposeFunction('nativeExchange', args => {
      if (!available) throw Error('Wi-Fi disconnected');
      const id = String(++serial);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error('Timed out')); }, 3000);
        pending.set(id, result => { clearTimeout(timer); resolve(result); });
        host.evaluate(event => window.testIncoming(event), { id, payload: args.payload }).catch(reject);
      });
    });
    await display.addInitScript(() => { window.oonjaiDesktop = { exchange: args => window.nativeExchange(args) }; });
    await host.goto(base + '/cashier.html'); await host.waitForFunction(() => window.restaurantCoreReady150); await host.evaluate(() => window.restaurantReady140);
    assert.equal(await host.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0, 'native bundle does not install a web service worker');
    await host.evaluate(async () => {
      const owner = '11111111-1111-4111-8111-111111111111';
      ojmDb = { from(name) { const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return q; }, order() { return q; }, range() { return q; }, abortSignal() { return q; }, then(resolve) { resolve({ data: name === 'profiles' ? { id: owner, full_name: 'Synthetic cashier', role: 'admin', status: 'active' } : name === 'restaurant_members121' ? null : [] }); } }; return q; }, rpc() { const q = { abortSignal() { return q; }, then(resolve) { resolve({ data: { orders: [], menu: [], categories: [], shifts: [], cash: [], stock: [], ingredients: [], items: [], moves: [] } }); } }; return q; } };
      ojmDb.auth = { onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } };
      await hydrateCore132({ user: { id: owner, email: 'fixture@example.test' } });
    });
    await host.waitForFunction(() => window.pos118?.state.loaded).catch(async error => { console.error(await host.evaluate(() => ({ state: window.pos118?.state, login: document.getElementById('loginError').textContent, text: document.body.innerText.slice(-2000) })), errors); throw error; });
    await host.getByRole('button', { name: 'Customer display', exact: true }).click();
    const code = await host.getByRole('textbox', { name: 'Pairing code' }).inputValue();
    await display.goto(base + '/display.html');
    await display.getByRole('button', { name: 'Connect to cashier' }).click();
    await display.getByRole('textbox', { name: 'Pairing code' }).fill(code);
    await display.getByRole('button', { name: 'Connect', exact: true }).click();
    await display.getByText('Connected to cashier', { exact: true }).waitFor();
    await host.evaluate(() => pos118.setDraft146({ id: 'fixture-sale', data: { lines: [{ name: '<b>Rice</b>', quantity: 2, unitPrice: 15000, options: ['Large'] }], customer: 'PRIVATE CUSTOMER', note: 'PRIVATE NOTE', discount: 1000, discountType: 'amount' } }));
    await display.getByText('29,000 LAK', { exact: true }).waitFor();
    assert.equal(await display.locator('#sale b').count(), 0, 'names are rendered as text, not markup');
    assert.equal((await display.locator('#sale').textContent()).includes('PRIVATE'), false);
    available = false;
    await display.getByText('Reconnecting to the cashier…', { exact: true }).waitFor();
    assert.equal(await display.getByText('29,000 LAK', { exact: true }).count(), 0, 'stale total is removed on disconnect');
    available = true; await display.getByText('29,000 LAK', { exact: true }).waitFor();
    await host.getByRole('button', { name: 'Disconnect all displays' }).click();
    await display.getByText('Reconnecting to the cashier…', { exact: true }).waitFor();
    assert.equal(await display.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.deepEqual(errors, []);
    console.log('PASS bundled cashier launch, sale updates, private-field filtering, safe text rendering, lost connection, reconnection and pairing revocation');
    await context.close();
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
