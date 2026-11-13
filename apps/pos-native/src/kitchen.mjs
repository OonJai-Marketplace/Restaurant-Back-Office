// Delivery acknowledgements only: a receiver cannot take payments or change sales.
export function ticketFromOrder(order) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(order?.id) || !Array.isArray(order.data?.lines) || !order.data.lines.length || order.data.lines.length > 150) throw Error('This order cannot be sent as a kitchen ticket.');
  const field = (value, max = 1000) => { const text = String(value ?? ''); if (text.length > max) throw Error('A kitchen instruction is too long. Shorten it before sending.'); return text; };
  const ticket = { id: field(order.id, 100), number: field(order.number && order.number !== 'LOCAL' ? order.number : order.id.slice(-8), 100), service: field(order.data.service, 100), note: field(order.data.note), cancelled: ['cancelled', 'canceled', 'refunded'].includes(order.status), lines: order.data.lines.map(line => ({ name: field(line.name, 200), quantity: Number(line.quantity), options: (Array.isArray(line.options) ? line.options : []).map(value => field(value, 200)), note: field(line.note) })) };
  if (ticket.lines.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0) || new TextEncoder().encode(JSON.stringify(ticket)).length > 40000) throw Error('This kitchen ticket is too large or contains an invalid quantity.');
  return ticket;
}
const fingerprint = ticket => JSON.stringify({ ...ticket, number: undefined });
export function enqueue(records, ticket, now = Date.now()) {
  const previous = records[ticket.id];
  if (previous && fingerprint(previous.ticket) === fingerprint(ticket)) return records;
  if ((!previous || previous.archived) && Object.values(records).filter(row => !row.archived).length >= 1000) throw Error('Kitchen history is full. Review and clear delivered tickets before sending more.');
  return { ...records, [ticket.id]: { ticket, revision: (previous?.revision || 0) + 1, sentAt: now, acknowledged: false } };
}
export function archiveDelivered(records) {
  return Object.fromEntries(Object.entries(records).map(([id, row]) => [id, row.acknowledged ? { ...row, ticket: { id, cancelled: row.ticket.cancelled }, archived: true } : row]));
}
export function acknowledge(records, acknowledgements) {
  const next = { ...records };
  for (const ack of acknowledgements.slice(0, 100)) {
    if (!ack || !Number.isInteger(ack.revision) || ack.revision < 1) continue;
    const row = next[ack.id];
    if (row && row.revision === ack.revision) next[ack.id] = { ...row, acknowledged: true };
  }
  return next;
}
export function pendingBatch(records) {
  const batch = []; let bytes = 0;
  for (const row of Object.values(records).filter(row => !row.acknowledged).sort((a, b) => a.sentAt - b.sentAt)) {
    const size = new TextEncoder().encode(JSON.stringify(row)).length;
    if (batch.length >= 8 || bytes + size > 48000) break;
    batch.push(row); bytes += size;
  }
  return batch;
}
export function receive(records, batch) {
  if (!Array.isArray(batch) || batch.length > 8) throw Error('Invalid ticket batch');
  const next = { ...records };
  for (const row of batch) {
    if (!row?.ticket || !Number.isInteger(row.revision) || row.revision < 1 || !Number.isFinite(row.sentAt)) throw Error('Invalid kitchen ticket');
    const ticket = ticketFromOrder({ id: row.ticket.id, number: row.ticket.number, status: row.ticket.cancelled ? 'cancelled' : 'unpaid', data: row.ticket });
    const previous = next[ticket.id];
    if (previous && previous.revision >= row.revision) continue;
    if (!previous && Object.keys(next).length >= 1000) throw Error('Receiver history is full. Clear completed tickets to receive more.');
    next[ticket.id] = { ticket, revision: row.revision, sentAt: row.sentAt, done: false };
  }
  return next;
}
export function mayLeaveMain(salesPending, records, working) {
  return !working && !salesPending && !Object.values(records).some(row => !row.acknowledged);
}
let opened;
function database() {
  return opened ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('oonjai-kitchen151', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function readState(key) {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction('state').objectStore('state').get(key); request.onsuccess = () => resolve(request.result || {}); request.onerror = () => reject(request.error); });
}
export async function changeState(key, update) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state'); let result, failure;
    const request = store.get(key);
    request.onsuccess = () => { try { result = update(request.result || {}); store.put(result, key); } catch (error) { failure = error; tx.abort(); } };
    tx.oncomplete = () => resolve(result); tx.onabort = tx.onerror = () => reject(failure || tx.error || Error('Kitchen storage failed'));
  });
}
