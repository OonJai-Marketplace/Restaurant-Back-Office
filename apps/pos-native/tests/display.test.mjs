import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomKey, nonce, pairing, seal, unseal, saleView, receivedView } from '../src/display-protocol.mjs';
const require = createRequire(import.meta.url);
const { LocalLink, local } = require('../desktop/transport.cjs');

test('only the sale projection crosses the customer-display boundary', () => {
  const value = saleView({ id: 'private-order', customer: 'private-name', data: { customer: 'private-phone', payment: 'private-payment', lines: [{ name: '<img src=x onerror=alert(1)>', quantity: 2, unitPrice: 15000, options: ['Large'], cost: 5000, inventoryId: 'private-stock' }] } }, { subtotal: 30000, discount: 1000, total: 29000 });
  assert.deepEqual(receivedView(value), value);
  assert.equal(value.total, 29000); assert.equal(value.lines[0].amount, 30000);
  assert.equal(JSON.stringify(value).includes('private-'), false);
  assert.deepEqual(saleView(null), { lines: [], subtotal: 0, discount: 0, total: 0, currency: 'LAK' });
});
test('authenticated encryption rejects wrong keys, tampering and reflected messages', async () => {
  const secret = randomKey(), data = { nonce: nonce(), type: 'view' }, wire = await seal(secret, data, 'request');
  assert.deepEqual(await unseal(secret, wire, 'request'), data);
  await assert.rejects(unseal(randomKey(), wire, 'request'));
  await assert.rejects(unseal(secret, wire, 'response'));
  const envelope = JSON.parse(wire); envelope.body = (envelope.body[0] === 'A' ? 'B' : 'A') + envelope.body.slice(1);
  await assert.rejects(unseal(secret, JSON.stringify(envelope), 'request'));
  await assert.rejects(unseal(secret, 'x'.repeat(100001), 'request'));
});
test('pairing and transport cannot connect to public hosts or loopback services', () => {
  for (const host of ['8.8.8.8', '127.0.0.1', 'localhost', 'example.com', '192.168.1.300', '192.168.1.1/other', '::1']) {
    assert.equal(local(host), false); assert.throws(() => pairing({ protocol: 'oonjai-display/1', host, port: 19741, key: randomKey() }));
  }
  assert.equal(pairing({ protocol: 'oonjai-display/1', host: '192.168.1.8', port: 19741, key: randomKey() }).host, '192.168.1.8');
});
test('two local devices exchange an encrypted sale and revoked pairing fails', async t => {
  let secret = randomKey(); const clientKey = secret;
  const host = new LocalLink(async event => {
    try { const request = await unseal(secret, event.payload, 'request'); await host.reply({ id: event.id, payload: await seal(secret, { nonce: request.nonce, view: saleView(null) }, 'response') }); }
    catch { await host.reply({ id: event.id, payload: '{}' }); }
  });
  const client = new LocalLink(() => {}); t.after(() => host.stop());
  let info;
  try { info = await host.start(); }
  catch (error) { if (error.code === 'ERR_SYSTEM_ERROR' && error.info?.syscall === 'uv_interface_addresses') { t.skip('This sandbox prohibits network-interface enumeration; LAN integration runs in CI.'); return; } throw error; }
  assert.ok(info.addresses.length, 'A private LAN address is needed for the transport integration test');
  const request = { type: 'view', nonce: nonce() };
  const args = { host: info.addresses[0], port: info.port, payload: await seal(clientKey, request, 'request') };
  const result = await client.exchange(args);
  const response = await unseal(clientKey, result.payload, 'response'); assert.equal(response.nonce, request.nonce); assert.equal(response.view.total, 0);
  secret = randomKey(); const revoked = await client.exchange(args);
  await assert.rejects(unseal(clientKey, revoked.payload, 'response'));
  await assert.rejects(client.exchange({ ...args, host: '8.8.8.8' }));
});
