import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketFromOrder, enqueue, acknowledge, pendingBatch, receive, mayLeaveMain } from '../src/kitchen.mjs';
const order = { id: '11111111-1111-4111-8111-111111111111', number: 'LOCAL', status: 'unpaid', data: { customer: 'PRIVATE', paymentReference: 'PRIVATE', service: 'Dine in', note: 'No peanuts', lines: [{ name: 'Rice', quantity: 2, options: ['Large'], note: 'No salt', unitPrice: 15000, cost: 5000 }] } };
test('kitchen receives cooking instructions and unique local order reference without financial/customer fields', () => {
  const ticket = ticketFromOrder(order); assert.equal(ticket.number, '11111111'); assert.equal(ticket.note, 'No peanuts'); assert.equal(ticket.lines[0].note, 'No salt');
  assert.equal(JSON.stringify(ticket).includes('PRIVATE'), false); assert.equal('unitPrice' in ticket.lines[0], false);
});
test('lost acknowledgement retries delivery without duplicating or reopening a completed ticket', () => {
  const sent = enqueue({}, ticketFromOrder(order)), batch = pendingBatch(sent);
  let inbox = receive({}, batch); inbox[order.id].done = true;
  inbox = receive(inbox, pendingBatch(sent)); assert.equal(Object.keys(inbox).length, 1); assert.equal(inbox[order.id].done, true);
  assert.equal(pendingBatch(acknowledge(sent, [{ id: order.id, revision: 1 }])).length, 0);
});
test('edits create a revision; stale acknowledgements cannot mark new instructions delivered', () => {
  const sent = enqueue({}, ticketFromOrder(order));
  const edited = structuredClone(order); edited.data.lines[0].quantity = 3;
  const next = enqueue(sent, ticketFromOrder(edited));
  assert.equal(next[order.id].revision, 2); assert.equal(pendingBatch(acknowledge(next, [{ id: order.id, revision: 1 }])).length, 1);
  const inbox = receive({ ...receive({}, pendingBatch(sent)), [order.id]: { ...sent[order.id], done: true } }, pendingBatch(next));
  assert.equal(inbox[order.id].done, false); assert.equal(inbox[order.id].ticket.lines[0].quantity, 3);
  assert.equal(enqueue(next, ticketFromOrder(edited)), next);
});
test('cancellations reach the kitchen; switching main role waits for pending work', () => {
  let rows = enqueue({}, ticketFromOrder(order)); assert.equal(mayLeaveMain(0, rows, false), false);
  rows = acknowledge(rows, [{ id: order.id, revision: 1 }]); assert.equal(mayLeaveMain(0, rows, false), true); assert.equal(mayLeaveMain(1, rows, false), false);
  rows = enqueue(rows, ticketFromOrder({ ...order, status: 'cancelled' })); assert.equal(pendingBatch(rows)[0].ticket.cancelled, true);
});
test('oversized tickets fail visibly rather than silently losing cooking instructions', () => {
  const large = structuredClone(order); large.data.note = 'x'.repeat(1001); assert.throws(() => ticketFromOrder(large));
});
