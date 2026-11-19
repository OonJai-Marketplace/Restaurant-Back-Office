import QRCode from 'qrcode';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import { pairing, randomKey, nonce, seal, unseal } from './display-protocol.mjs';
import { ticketFromOrder, enqueue, acknowledge, archiveDelivered, pendingBatch, receive, mayLeaveMain, readState, changeState } from './kitchen.mjs';

export function kitchenRuntime({ link, native, mobile, el, button, dialog, startHost }) {
  const saved = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const device = saved('native-device-id151') || crypto.randomUUID(); save('native-device-id151', device);
  let config = saved('native-kitchen-host151'), lastSeen = 0;
  const owner = () => window.pos118?.state.loaded && window.pos118.state.owner;
  const outbox = c => 'outbox:' + c.stream;
  const required = () => { if (!native) throw Error('Pairing needs the installed Android, iPad or desktop app.'); };
  const capture = async order => {
    if (!config || owner() !== config.owner || window.pos118.state.sample) return;
    await changeState(outbox(config), rows => enqueue(rows, ticketFromOrder(order)));
  };
  const failure = error => dialog('Order saved · kitchen delivery needs attention', error.message + ' The sale was saved. Use Send ticket again; do not record the payment again.');
  window.nativeKitchen151 = { capture, failure };
  async function respond(payload) {
    if (!config || owner() !== config.owner || document.hidden) throw Error('Main POS unavailable');
    const current = config, request = await unseal(current.key, payload, 'kitchen-request');
    if (request.type !== 'tickets' || request.stream !== current.stream || typeof request.peer !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(request.peer) || typeof request.nonce !== 'string' || request.nonce.length !== 24 || !Array.isArray(request.acks) || request.acks.length > 100) throw Error('Invalid receiver request');
    if (current.peer && current.peer !== request.peer) throw Error('Another receiver is paired.');
    if (!current.peer) { current.peer = request.peer; save('native-kitchen-host151', current); }
    const rows = await changeState(outbox(current), rows => acknowledge(rows, request.acks));
    if (current !== config || owner() !== current.owner) throw Error('Main POS changed');
    const accepted = request.acks.filter(ack => rows[ack.id]?.revision === ack.revision && rows[ack.id].acknowledged);
    lastSeen = Date.now();
    return seal(current.key, { nonce: request.nonce, stream: current.stream, tickets: pendingBatch(rows), accepted }, 'kitchen-response');
  }
  async function pairReceiver() {
    required(); const id = owner(); if (!id) throw Error('Sign in and open the main POS before pairing the receiver.');
    if (!config || config.owner !== id) { config = { owner: id, stream: device + '-' + id, key: randomKey(), peer: null }; save('native-kitchen-host151', config); }
    const address = await startHost();
    if (!address.addresses?.length) throw Error('Connect to the shop Wi-Fi and allow local-network access.');
    const panel = dialog('Pair the kitchen / ticket receiver', 'On the other Android tablet, iPad or desktop, choose Kitchen / Ticket Receiver and scan this code. Both devices use the same shop Wi-Fi. Each pair has one Main POS and one receiver.');
    const select = el('select'), canvas = el('canvas'), code = el('textarea'); code.readOnly = true; code.setAttribute('aria-label', 'Kitchen pairing code'); select.setAttribute('aria-label', 'Main POS Wi-Fi address');
    for (const host of address.addresses) { const option = el('option', host); option.value = host; select.append(option); }
    panel.add(select); panel.add(canvas); panel.add(code);
    const update = async () => { code.value = JSON.stringify(pairing({ protocol: 'oonjai-kitchen/1', host: select.value, port: address.port, key: config.key, stream: config.stream })); await QRCode.toCanvas(canvas, code.value, { width: 300, margin: 2 }); };
    select.onchange = () => update().catch(failure); await update();
    panel.actions.prepend(button('Replace paired receiver', async () => { config = { ...config, key: randomKey(), peer: null }; save('native-kitchen-host151', config); lastSeen = 0; await update(); }));
    panel.actions.append(button('Clear delivered ticket history', async () => { await changeState(outbox(config), archiveDelivered); dialog('Delivered ticket history cleared', 'Pending tickets and sales remain on this device. Received tickets stay on the kitchen screen until marked Done there.'); }));
    panel.add(el('p', 'To reverse the devices, finish pending work, choose Change device role on both, and pair again. Sales and ticket history stay on the device that recorded them.'));
  }
  async function changeMainRole() {
    const pos = window.pos118, rows = config ? await readState(outbox(config)) : {};
    const account = pos?.state.owner || config?.owner;
    const sales = account && window.posOffline119 ? await window.posOffline119.queue(account) : [];
    const draft = pos?.draft, recorded = pos?.state.orders.find(order => order.id === draft?.id);
    if (draft?.data?.lines?.length && (!recorded || JSON.stringify(ticketFromOrder({ ...recorded, data: draft.data })) !== JSON.stringify(ticketFromOrder(recorded)))) throw Error('Save the current order before changing this device’s role.');
    if (!mayLeaveMain(sales.length, rows, pos?.state.working || pos?.state.busy)) throw Error('Finish the current action, sync pending sales and deliver pending kitchen tickets before changing this device’s role.');
    const panel = dialog('Change this device’s role', 'Save the current order before leaving. Recorded sales and ticket history stay on this device. Select the new roles on both devices, then pair the receiver to the new main POS.');
    panel.actions.prepend(button('Go to device roles', async () => { if (native) await link.stop(); location.href = 'index.html'; }));
  }
  function mainControls() {
    const status = el('output', 'Kitchen receiver not connected'); status.id = 'kitchenStatus151';
    let checking = false;
    const check = async () => {
      if (checking) return; checking = true;
      try {
        const rows = config ? await readState(outbox(config)) : {}, count = Object.values(rows).filter(row => !row.acknowledged).length;
        status.textContent = (Date.now() - lastSeen < 6000 ? 'Kitchen receiver connected' : 'Kitchen receiver not connected') + (count ? ' · ' + count + ' tickets awaiting receipt' : '');
        // Cancellation/refund updates only apply to orders already sent to this kitchen.
        if (config && owner() === config.owner) for (const order of window.pos118.state.orders) if (rows[order.id] && !rows[order.id].ticket.cancelled && ['cancelled', 'canceled', 'refunded'].includes(order.status)) await capture(order);
      } catch (error) { status.textContent = error.message; } finally { checking = false; }
    };
    setInterval(check, 1500); check();
    return [el('strong', 'MAIN POS'), button('Pair ticket receiver', pairReceiver), button('Send ticket', async () => {
      if (!config || config.owner !== owner()) throw Error('Pair the kitchen receiver first.');
      const pos = window.pos118, record = pos.state.orders.find(order => order.id === pos.draft?.id);
      if (!record) throw Error('Save the order first. Saved orders are sent automatically after pairing.');
      if (JSON.stringify(ticketFromOrder({ ...record, data: pos.draft.data })) !== JSON.stringify(ticketFromOrder(record))) throw Error('Save the order changes before sending the ticket.');
      await capture(record); dialog('Kitchen delivery', 'The saved order is queued for the receiver. The status bar shows any tickets still awaiting receipt.');
    }), button('Change device role', changeMainRole), status];
  }
  async function setupReceiver() {
    required(); await link.stop();
    let paired; try { paired = pairing(saved('native-kitchen-pair151')); if (paired.protocol !== 'oonjai-kitchen/1') paired = null; } catch { paired = null; }
    const status = document.getElementById('connection'), root = document.getElementById('tickets'); let generation = 0, rendered = '';
    const inbox = () => 'inbox:' + paired.stream;
    async function draw() {
      const rows = paired ? await readState(inbox()) : {}, encoded = JSON.stringify(rows); if (encoded === rendered) return; rendered = encoded; root.replaceChildren();
      const active = Object.values(rows).filter(row => !row.done).sort((a, b) => a.sentAt - b.sentAt);
      if (!active.length) root.append(el('p', paired ? 'Ready for the next order.' : 'Connect this receiver to the main POS before service.', 'native-help'));
      for (const row of active) {
        const card = el('article', null, 'native-ticket'), ticket = row.ticket;
        card.append(el('h2', (ticket.cancelled ? 'CANCELLED · ' : '') + 'Order ' + ticket.number), el('p', ticket.service + ' · revision ' + row.revision));
        if (ticket.cancelled) card.classList.add('cancelled');
        for (const line of ticket.lines) { card.append(el('strong', line.quantity + ' × ' + line.name)); if (line.options.length) card.append(el('p', line.options.join(' · '))); if (line.note) card.append(el('p', line.note)); }
        if (ticket.note) card.append(el('p', 'Order note: ' + ticket.note));
        card.append(button(ticket.cancelled ? 'Acknowledge cancellation' : 'Done', async () => { await changeState(inbox(), rows => ({ ...rows, [ticket.id]: { ...rows[ticket.id], done: true } })); await draw(); })); root.append(card);
      }
    }
    async function mayChange() { if (paired && Object.values(await readState(inbox())).some(row => !row.done || !row.confirmed)) throw Error('Finish or acknowledge the received kitchen tickets and wait for delivery confirmation before changing this device’s role or pairing.'); }
    document.querySelector('a[href="index.html"]').onclick = async event => { event.preventDefault(); try { await mayChange(); location.href = 'index.html'; } catch (error) { dialog('Kitchen tickets are still open', error.message); } };
    const connect = async value => { const next = pairing(value); if (next.protocol !== 'oonjai-kitchen/1') throw Error('Scan a Kitchen / Ticket Receiver code from the main POS.'); if (paired?.stream !== next.stream) await mayChange(); paired = next; save('native-kitchen-pair151', next); generation++; rendered = ''; await draw(); status.textContent = 'Connecting to main POS…'; };
    document.getElementById('pair').onclick = () => {
      const panel = dialog('Connect to main POS', 'On the main Android tablet, iPad or desktop, choose Pair ticket receiver. Scan its code or paste it below.');
      const input = el('textarea'); input.setAttribute('aria-label', 'Kitchen pairing code'); panel.add(input);
      panel.actions.prepend(button('Connect', async () => { await connect(input.value); panel.box.close(); }));
      if (mobile) panel.actions.prepend(button('Scan QR code', async () => { const result = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE }); await connect(result.ScanResult); panel.box.close(); }));
      panel.actions.append(button('Clear completed tickets', async () => { if (paired) await changeState(inbox(), rows => Object.fromEntries(Object.entries(rows).filter(([, row]) => !row.done || !row.confirmed))); await draw(); }));
    };
    async function poll() {
      const epoch = generation;
      try {
        if (!paired || document.hidden) return;
        const current = paired, key = inbox(), rows = await readState(key), token = nonce();
        const acks = Object.values(rows).filter(row => !row.confirmed).slice(0, 100).map(row => ({ id: row.ticket.id, revision: row.revision }));
        const result = await link.exchange({ host: current.host, port: current.port, payload: await seal(current.key, { type: 'tickets', stream: current.stream, peer: device, nonce: token, acks }, 'kitchen-request') });
        const response = await unseal(current.key, result.payload, 'kitchen-response');
        if (generation !== epoch) return;
        if (response.nonce !== token || response.stream !== current.stream || !Array.isArray(response.accepted)) throw Error('Invalid receiver response');
        await changeState(key, rows => { const next = receive(rows, response.tickets); for (const ack of response.accepted) if (next[ack.id]?.revision === ack.revision) next[ack.id] = { ...next[ack.id], confirmed: true }; return next; });
        await draw(); status.textContent = 'Connected to main POS'; status.classList.remove('native-disconnected');
      } catch (error) { if (epoch === generation) { status.textContent = 'Not receiving · retrying · ' + error.message + ' · received tickets kept'; status.classList.add('native-disconnected'); } }
      finally { setTimeout(poll, 1000); }
    }
    await draw(); poll();
  }
  return { respond, mainControls, setupReceiver };
}
