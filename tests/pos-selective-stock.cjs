const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/pos-v118.js', 'utf8');
const menu = { id: 'drink', data: { recipe: [
  { itemId: 'tea', quantity: 2 }, { itemId: 'untracked', quantity: 8 }
], posOptions118: [{ id: 'extras', options: [{ id: 'ice', recipe: [] }] }] } };
const rule = (kind, quantity, extra = {}) => ({ menuId: 'drink', kind, quantity, ...extra });
const bottle = { id: 'bottle', data: { posMenuUse: [rule('packaging', 1)] } };
const tea = { id: 'stock-tea', data: {} };
const ice = { id: 'stock-ice', data: { posMenuUse: [rule('ingredient', 4, { groupId: 'extras', optionId: 'ice' })] } };
const state = { menu: [menu], items: [tea, bottle, ice], ingredients: [
  { id: 'tea', data: { inventoryItemId118: 'stock-tea', inventoryFactor118: 0.5 } }
] };
const context = { S: state, n: v => Number(v) || 0 };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function optionAvailable'), source.indexOf('function linkedStockFields')), context);
function use(service, choices = {}, packaging = {}, stockUsed = {}, onlineStockExtra = {}) {
  const result = context.recipeUsage124({ service, lines: [{ menuId: 'drink', quantity: 3, choices, packaging, stockUsed, onlineStockExtra }] });
  return { ...result };
}
assert.deepEqual(use('Dine in'), { 'stock-tea': 3 });
assert.deepEqual(use('Dine in', {}, { bottle: 1 }), { 'stock-tea': 3, bottle: 1 });
assert.deepEqual(use('Online', { extras: ['ice'] }), { 'stock-tea': 3, bottle: 3, 'stock-ice': 12 });
tea.data.posMenuUse = [rule('ingredient', 2)];
assert.deepEqual(use('Online'), { 'stock-tea': 6, bottle: 3 });
bottle.data.active = false;
assert.deepEqual(use('Online'), { 'stock-tea': 6 });
menu.data.recipe = [];
tea.data.posMenuUse = [];
assert.deepEqual(use('Dine in'), {});
console.log('PASS optional stock, conditional choices, packaging, and explicit-rule precedence');

bottle.data.active = true;
const napkin = { id: 'napkin', data: { posMenuUse: [rule('supply', 2, { stockMode: 'online' })] } };
state.items.push(napkin);
const actual = { bottle: 4, napkin: 0.5, unrelated: 10 };
const bonus = { bottle: 2, napkin: 3, unrelated: 10 };
assert.deepEqual(use('Dine in', {}, {}, actual, bonus), { bottle: 4, napkin: 0.5 });
assert.deepEqual(use('Online', {}, {}, actual, bonus), { bottle: 5, napkin: 9 });
assert.deepEqual(use('Online', {}, {}, { bottle: 0, napkin: 0 }), { bottle: 3, napkin: 6 });
napkin.data.posMenuUse[0].stockMode = 'all';
assert.deepEqual(use('Dine in'), { napkin: 6 });
assert.deepEqual(use('Dine in', {}, {}, { napkin: 0 }), {});
console.log('PASS online allocations plus bonuses, separate dine-in totals, fractional use and eligible links');

menu.data.recipe = [{ itemId: 'tea', quantity: 2 }];
tea.data.posMenuExclude = ['drink'];
assert.equal(use('Online', {}, {}, {}, { 'stock-tea': 10 })['stock-tea'], undefined);
tea.data.posMenuExclude = ['another-menu'];
assert.equal(use('Dine in')['stock-tea'], 3);
tea.data.posMenuExclude = ['drink'];
tea.data.posMenuUse = [rule('ingredient', 2)];
assert.equal(use('Online')['stock-tea'], 6);
console.log('PASS menu-specific recipe exclusion, restoration, and independently allocated stock');
