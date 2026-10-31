import { Capacitor, registerPlugin } from '@capacitor/core';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import QRCode from 'qrcode';
import { randomKey, nonce, pairing, seal, unseal, saleView, receivedView } from './display-protocol.mjs';

const link = window.oonjaiDesktop || registerPlugin('OonJaiLocalLink');
const native = !!window.oonjaiDesktop || Capacitor.isNativePlatform();
const money = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value) + ' LAK';
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const saved = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
let currentSale = saleView(null), lastSeen = 0, hostKey = saved('native-display-host-key'), listening = false;
let status;
const message = text => { if (status) status.textContent = text; };
function dialog(title, text) {
  const box = el('dialog', null, 'native-dialog');
  box.append(el('h2', title), el('p', text));
  const actions = el('div', null, 'actions'), close = el('button', 'Close');
  close.onclick = () => box.close(); actions.append(close); box.append(actions);
  box.addEventListener('close', () => box.remove()); document.body.append(box); box.showModal();
  return { box, actions, add: node => actions.before(node) };
}
function button(text, action) { const b = el('button', text); b.type = 'button'; b.onclick = async () => { b.disabled = true; try { await action(); } catch (error) { dialog('Could not complete', error.message); } finally { b.disabled = false; } }; return b; }
function transportRequired() { if (!native) throw Error('Local device pairing needs the Android, iPad or desktop application. This browser preview cannot connect the devices.'); }
async function startHost() {
  transportRequired();
  if (!hostKey) { hostKey = randomKey(); save('native-display-host-key', hostKey); }
  if (!listening) {
    await link.addListener('request', async event => {
      let response = '{}';
      try {
        const request = await unseal(hostKey, event.payload, 'request');
        if (request.type !== 'view' || typeof request.nonce !== 'string' || request.nonce.length !== 24) throw Error('Invalid request');
        response = await seal(hostKey, { nonce: request.nonce, view: currentSale }, 'response');
        lastSeen = Date.now();
      } catch { /* Invalid peers receive no sale information. */ }
      await link.reply({ id: event.id, payload: response }).catch(() => {});
    });
    listening = true;
  }
  return link.start();
}
async function hostPairing() {
  const address = await startHost();
  if (!address.addresses?.length) throw Error('Join the shop Wi-Fi, then try again. On iPad, allow Local Network access in Settings.');
  const panel = dialog('Connect the customer display', 'On the iPad, choose Customer display → Connect to cashier and scan this code. Both devices must use the same shop Wi-Fi. Keep this code private.');
  const select = el('select'), canvas = el('canvas'), code = el('textarea'); code.readOnly = true; code.setAttribute('aria-label', 'Pairing code'); select.setAttribute('aria-label', 'Cashier Wi-Fi address');
  for (const host of address.addresses) { const option = el('option', host); option.value = host; select.append(option); }
  panel.add(select); panel.add(canvas); panel.add(code);
  const update = async () => { code.value = JSON.stringify(pairing({ protocol: 'oonjai-display/1', host: select.value, port: address.port, key: hostKey })); await QRCode.toCanvas(canvas, code.value, { width: 300, margin: 2 }); };
  select.onchange = () => update().catch(error => message(error.message)); await update();
  panel.actions.prepend(button('Disconnect all displays', async () => { hostKey = randomKey(); save('native-display-host-key', hostKey); lastSeen = 0; await update(); message('Displays disconnected. Scan the new code to reconnect.'); }));
}
async function setupCashier() {
  const bar = el('nav', null, 'native-toolbar'); bar.setAttribute('aria-label', 'Device controls');
  status = el('output', native ? 'Customer display not connected' : 'Browser preview · pairing requires installed app');
  bar.append(button('Customer display', hostPairing), button('Download POS data', async () => {
    const pos = window.pos118;
    if (!pos?.state.loaded || !pos.state.owner) throw Error('Sign in and open the POS first.');
    if (!navigator.onLine) throw Error('Internet is needed to download the latest catalog. Saved data remains on this device.');
    await pos.load();
    if (pos.state.offline || !pos.state.loaded || pos.state.error) throw Error(pos.state.error || 'Data could not be downloaded.');
    const snapshot = await window.posOffline119.getSnapshot(pos.state.owner + ':priority125');
    if (!snapshot) throw Error('Data could not be saved on this device.');
    dialog('POS data downloaded', 'The catalog and current POS records are saved on this device. Open the shift while online before taking offline payments. Offline sales stay queued here until they sync.');
  }), button('Sync sales', async () => {
    if (!window.pos118?.state.owner) throw Error('Sign in and open the POS first.');
    await window.pos118.load();
    const s = window.pos118.state;
    dialog('Sales sync', s.offline ? 'Internet is unavailable. Sales remain queued on this device.' : s.offlineQueue.length ? s.offlineQueue.length + ' sales are still pending. ' + (s.syncError || 'Retry when connected.') : 'No sales are waiting to sync.');
  }), button('App updates', async () => {
    dialog('App version 1.0.0 · Testing build', 'Automatic update distribution is not configured yet. Install a newer company-signed package over this app when available. Do not uninstall the app or clear its data while sales are waiting to sync. iPad installation requires the company’s Apple distribution setup.');
  }), status);
  document.body.prepend(bar);
  // Observe the authoritative cashier draft without passing account/customer/payment fields.
  const refresh = () => {
    const pos = window.pos118;
    currentSale = pos?.state.loaded && pos.state.owner && !document.hidden ? saleView(pos.draft, pos.draft?.data ? pos.total(pos.draft.data) : null) : saleView(null);
    if (native) message(Date.now() - lastSeen < 6000 ? 'Customer display connected' : 'Customer display not connected');
  };
  setInterval(refresh, 250); refresh();
  document.addEventListener('visibilitychange', refresh);
  if (hostKey && native) startHost().catch(error => message(error.message));
}
function showSale(view) {
  const root = document.getElementById('sale'); root.replaceChildren();
  if (!view.lines.length) { const empty = el('div', null, 'native-empty'); empty.append(el('span', 'WELCOME TO OON JAI'), el('h1', 'Your order will appear here.'), el('p', 'Please check your items and total before payment.')); root.append(empty); return; }
  const grid = el('div', null, 'native-sale'), lines = el('section', null, 'native-lines'), totals = el('aside', null, 'native-total');
  lines.append(el('h2', 'Your order'));
  for (const line of view.lines) { const row = el('div', null, 'native-line'); row.append(el('span', line.quantity + '×'), el('strong', line.name), el('span', money(line.amount))); if (line.options.length) row.append(el('small', line.options.join(' · '))); lines.append(row); }
  const dl = el('dl'); dl.append(el('dt', 'Subtotal'), el('dd', money(view.subtotal)), el('dt', 'Discount'), el('dd', money(view.discount)));
  totals.append(el('p', 'TOTAL DUE'), el('h1', money(view.total)), dl); grid.append(lines, totals); root.append(grid);
}
async function setupDisplay() {
  status = document.getElementById('connection');
  let paired; try { paired = pairing(saved('native-display-pair')); } catch { paired = null; }
  let generation = 0, previous = '';
  const disconnected = () => {
    previous = ''; const root = document.getElementById('sale'), empty = el('div', null, 'native-empty');
    empty.append(el('h1', 'Reconnecting to the cashier…'), el('p', 'Check that both apps are open and connected to the same shop Wi-Fi.'));
    root.replaceChildren(empty); message('Disconnected · reconnecting'); status.classList.add('native-disconnected');
  };
  const connect = value => { transportRequired(); paired = pairing(value); save('native-display-pair', paired); generation++; previous = ''; message('Connecting…'); };
  document.getElementById('pair').onclick = () => {
    const panel = dialog('Connect to cashier', 'Open Customer display on the cashier device. Scan its QR code, or paste the pairing code below.');
    const input = el('textarea'); input.setAttribute('aria-label', 'Pairing code'); input.placeholder = 'Paste the cashier’s pairing code'; panel.add(input);
    if (Capacitor.isNativePlatform()) panel.actions.prepend(button('Scan QR code', async () => {
      const result = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE, scanInstructions: 'Scan the code shown on the cashier POS' });
      connect(result.ScanResult); panel.box.close();
    }));
    panel.actions.prepend(button('Connect', () => { connect(input.value); panel.box.close(); }));
    panel.actions.append(button('Forget cashier', () => { paired = null; generation++; localStorage.removeItem('native-display-pair'); previous = ''; showSale(receivedView(saleView(null))); message('Not paired'); panel.box.close(); }));
  };
  async function poll() {
    const epoch = generation;
    if (paired && !document.hidden && native) try {
      const token = nonce(), secret = paired.key;
      const response = await link.exchange({ host: paired.host, port: paired.port, payload: await seal(secret, { type: 'view', nonce: token }, 'request') });
      const data = await unseal(secret, response.payload, 'response');
      if (epoch !== generation) return;
      if (data.nonce !== token) throw Error('Stale response');
      const view = receivedView(data.view), encoded = JSON.stringify(view);
      if (encoded !== previous) { showSale(view); previous = encoded; }
      message('Connected to cashier'); status.classList.remove('native-disconnected');
    } catch { if (epoch === generation && paired) disconnected(); }
    finally { setTimeout(poll, 1000); }
    else setTimeout(poll, 1000);
  }
  poll();
}
if (location.pathname.endsWith('/cashier.html')) setupCashier().catch(error => message(error.message));
if (location.pathname.endsWith('/display.html')) setupDisplay().catch(error => message(error.message));
