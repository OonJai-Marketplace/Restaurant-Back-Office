import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), repo = path.resolve(app, '../..'), out = path.join(app, 'www');
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
for (const name of ['scripts', 'styles', 'vendor', 'assets', 'public-restaurant']) {
  await cp(path.join(repo, name), path.join(out, name), { recursive: true, filter: file => !file.includes('node_modules') });
}
for (const name of ['index.html', 'display.html', 'receiver.html', 'native.css']) await cp(path.join(app, 'src', name), path.join(out, name));
await build({ entryPoints: [path.join(app, 'src/runtime.mjs')], bundle: true, outfile: path.join(out, 'native-runtime.js'), format: 'iife', target: ['safari16', 'chrome100'], minify: true });
let html = await readFile(path.join(repo, 'pos/index.html'), 'utf8');
html = html.replace('<base href="../">', '<base href="./">').replace(/<link[^>]+rel="manifest"[^>]*>/g, '');
html = html.replace('</head>', '<link rel="stylesheet" href="native.css"></head>');
// The native binary contains all scripts. It must never register a hosted worker.
html = html.replace(/if\('serviceWorker' in navigator&&/, "if(false&&'serviceWorker' in navigator&&");
html = html.replace('<script id="restaurantBoot150">', '<script src="native-runtime.js"></script><script id="restaurantBoot150">');
await writeFile(path.join(out, 'cashier.html'), html);
const posPath = path.join(out, 'scripts/restaurant-pos150.bundle.js');
let pos = await readFile(posPath, 'utf8');
const savedMarker = 'draft=structuredClone(result);S.selected=result.id;showCenterStatus';
if (pos.split(savedMarker).length !== 2) throw Error('The saved-order integration point changed; review native kitchen delivery.');
pos = pos.replace(savedMarker, "draft=structuredClone(result);S.selected=result.id;await window.nativeKitchen151?.capture(result).catch(error=>window.nativeKitchen151.failure(error));showCenterStatus");
await writeFile(posPath, pos);
await writeFile(path.join(out, 'build.json'), JSON.stringify({ version: '1.1.0', source: 'install150', localDisplay: 1, channel: 'device-testing' }));
console.log('Bundled local cashier, customer display and native bridge.');
