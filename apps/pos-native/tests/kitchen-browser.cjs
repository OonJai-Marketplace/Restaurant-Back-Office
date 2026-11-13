// Browser integration of both device-role assignments; native OS testing remains separate.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../www');
const server = http.createServer((req, res) => {
  let file = path.join(root, new URL(req.url, 'http://localhost').pathname); if(file.endsWith('/')) file += 'index.html';
  try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'); res.end(fs.readFileSync(file)); } catch { res.writeHead(404); res.end('Missing'); }
});
async function signIn(page) {
  await page.waitForFunction(() => window.restaurantCoreReady150); await page.evaluate(() => window.restaurantReady140);
  await page.evaluate(async () => {
    const owner = '11111111-1111-4111-8111-111111111111'; let savedOrders = [];
    const snapshot = () => ({ orders: savedOrders, menu: [], categories: [], shifts: [], cash: [], stock: [], ingredients: [], items: [], moves: [] });
    ojmDb = {
      auth: { onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
      from(name) { const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return q; }, order() { return q; }, range() { return q; }, abortSignal() { return q; }, then(resolve) { resolve({ data: name === 'profiles' ? { id: owner, full_name: 'Synthetic cashier', role: 'admin', status: 'active' } : name === 'restaurant_members121' ? null : [] }); } }; return q; },
      rpc(name, args) { const q = { abortSignal() { return q; }, then(resolve) {
        if (name === 'pos_order118') { const order = { id: args.p_id, number: 42, version: args.p_version + 1, status: 'unpaid', data: args.p_data }; savedOrders = [order, ...savedOrders.filter(row => row.id !== order.id)]; resolve({ data: order }); }
        else resolve({ data: snapshot() });
      } }; return q; }
    };
    await hydrateCore132({ user: { id: owner, email: 'fixture@example.test' } });
  });
  await page.waitForFunction(() => window.pos118?.state.loaded);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), headless: true, args: ['--no-sandbox'] });
  const endpoints = new Map(), pending = new Map(), errors = []; let available = true, serial = 0;
  try {
    const pages = [];
    for (const [index, userAgent] of ['Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1'].entries()) {
      const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, userAgent });
      await context.route(/^https:\/\//, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      const page = await context.newPage(), address = '192.168.1.' + (8 + index), endpoint = { page, listening: false }; endpoints.set(address, endpoint); pages.push(page);
      page.on('pageerror', error => errors.push(error.stack));
      await page.exposeFunction('nativeStart', () => { endpoint.listening = true; return { addresses: [address], port: 19741 }; });
      await page.exposeFunction('nativeStop', () => { endpoint.listening = false; });
      await page.exposeFunction('nativeReply', ({ id, payload }) => { pending.get(id)?.({ payload }); pending.delete(id); });
      await page.exposeFunction('nativeExchange', args => {
        const host = endpoints.get(args.host); if (!available || !host?.listening) throw Error('Wi-Fi disconnected'); const id = String(++serial);
        return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(Error('Timed out')); }, 2500); pending.set(id, result => { clearTimeout(timer); resolve(result); }); host.page.evaluate(event => window.testIncoming(event), { id, payload: args.payload }).catch(reject); });
      });
      await page.addInitScript(() => { window.oonjaiDesktop = { start: () => window.nativeStart(), stop: () => window.nativeStop(), reply: args => window.nativeReply(args), exchange: args => window.nativeExchange(args), addListener: async (_name, callback) => { window.testIncoming = callback; return { remove() {} }; } }; });
      await page.goto(base + '/index.html');
      assert.equal(await page.getByRole('link', { name: /Main POS/ }).count(), 1);
      assert.equal(await page.getByRole('link', { name: /Kitchen \/ Ticket Receiver/ }).count(), 1);
    }
    for (let round = 0; round < 2; round++) {
      const main = pages[round], receiver = pages[1 - round];
      await main.getByRole('link', { name: /Main POS/ }).click(); await signIn(main);
      await receiver.getByRole('link', { name: /Kitchen \/ Ticket Receiver/ }).click();
      await main.getByRole('button', { name: 'Pair ticket receiver', exact: true }).click();
      const code = await main.getByRole('textbox', { name: 'Kitchen pairing code' }).inputValue();
      await main.getByRole('button', { name: 'Close', exact: true }).click();
      await receiver.getByRole('button', { name: 'Connect to main POS', exact: true }).click();
      await receiver.getByRole('textbox', { name: 'Kitchen pairing code' }).fill(code);
      await receiver.getByRole('button', { name: 'Connect', exact: true }).click();
      await receiver.getByText('Connected to main POS', { exact: true }).waitFor();
      await main.evaluate(async round => {
        if(round===0)pos118.state.offline=true;
        pos118.setDraft146({ id: '22222222-2222-4222-8222-22222222222' + round, version: 0, data: { service: 'Dine in', customer: 'PRIVATE CUSTOMER', note: 'No peanuts', discount: 0, discountType: 'amount', lines: [{ menuId: 'fixture-rice', name: 'Rice', quantity: 2, unitPrice: 15000, options: ['Large'], note: 'No salt' }] } });
        await pos118.save('save');
      }, round);
      await receiver.getByText('2 × Rice', { exact: true }).waitFor(); await receiver.getByText('Order note: No peanuts', { exact: true }).waitFor();
      assert.equal((await receiver.locator('#tickets').textContent()).includes('PRIVATE'), false);
      assert.equal(await receiver.locator('.native-ticket').count(), 1);
      available = false;
      await receiver.waitForFunction(() => document.getElementById('connection').classList.contains('native-disconnected'));
      await receiver.reload(); await receiver.getByText('2 × Rice', { exact: true }).waitFor();
      available = true; await receiver.getByText('Connected to main POS', { exact: true }).waitFor();
      assert.equal(await receiver.locator('.native-ticket').count(), 1, 'Reconnect does not duplicate an order');
      await receiver.getByRole('link', { name: 'Change device role' }).click();
      await receiver.getByRole('heading', { name: 'Kitchen tickets are still open' }).waitFor();
      await receiver.getByRole('button', { name: 'Close', exact: true }).click();
      await receiver.getByRole('button', { name: 'Done', exact: true }).click();
      await main.waitForFunction(() => !document.getElementById('kitchenStatus151').textContent.includes('awaiting receipt'));
      if (round === 0) {
        await main.getByRole('button', { name: 'Change device role' }).click();
        await main.getByRole('heading', { name: 'Could not complete' }).waitFor();
        await main.getByRole('button', { name: 'Close', exact: true }).click();
        await main.evaluate(async()=>{ await pos118.syncPending(); await pos118.load(); });
        await main.getByRole('button', { name: 'Change device role' }).click();
        await main.getByRole('button', { name: 'Go to device roles' }).click();
        await receiver.getByRole('link', { name: 'Change device role' }).click();
      }
      console.log('PASS ' + (round === 0 ? 'Android-main / iPad-receiver' : 'iPad-main / Android-receiver') + ' browser role assignment, saved-order delivery, persistent receipts, reconnect and role-change guard');
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
