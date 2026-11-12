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
vm.runInContext(source.slice(source.indexOf('function optionAvailable'), source.indexOf('function packagingFields')), context);
function use(service, choices = {}, packaging = {}) {
  const result = context.recipeUsage124({ service, lines: [{ menuId: 'drink', quantity: 3, choices, packaging }] });
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
