#!/usr/bin/env node
// Atlas build: bundles modular sources into a single self-contained Atlas.html
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });

function read(p) { return fs.readFileSync(p, 'utf8'); }
function list(dir, ext) {
  return fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort().map(f => path.join(dir, f));
}

// ---------- gather sources ----------
const cssFiles = list(path.join(SRC, 'styles'), '.css');
const jsFiles = list(path.join(SRC, 'js'), '.js');
const css = cssFiles.map(f => `/* ${path.basename(f)} */\n` + read(f)).join('\n');
const js = jsFiles.map(f => `/* ===== ${path.basename(f)} ===== */\n` + read(f)).join('\n');

// ---------- font ----------
const fontDir = process.env.VAZIR_DIR || '/tmp/node_modules/@fontsource/vazirmatn/files';
function b64(p) { return fs.readFileSync(p).toString('base64'); }
const fonts = [
  { f: 'vazirmatn-arabic-400-normal.woff2', w: 400 },
  { f: 'vazirmatn-arabic-500-normal.woff2', w: 500 },
  { f: 'vazirmatn-arabic-700-normal.woff2', w: 700 },
  { f: 'vazirmatn-latin-400-normal.woff2', w: 400 },
  { f: 'vazirmatn-latin-700-normal.woff2', w: 700 },
];
let fontCSS = '';
for (const it of fonts) {
  const p = path.join(fontDir, it.f);
  if (!fs.existsSync(p)) { console.error('missing font', p); process.exit(1); }
  fontCSS += `@font-face{font-family:'Vazirmatn';font-style:normal;font-weight:${it.w};font-display:swap;src:url(data:font/woff2;base64,${b64(p)}) format('woff2');}\n`;
}

// ---------- app version ----------
const pkg = JSON.parse(read(path.join(ROOT, 'app.json')));
const APP_VERSION = pkg.version;
const SCHEMA_VERSION = pkg.schemaVersion;

// ---------- embedded initial data ----------
const seedPath = path.join(ROOT, 'seed.json');
const seed = fs.existsSync(seedPath) ? read(seedPath) : 'null';

// ---------- patch payload (optional, bundled at build time) ----------
const patchDir = path.join(ROOT, 'patches', 'patch1');
let patchPayload = null;
if (fs.existsSync(path.join(patchDir, 'payload.js'))) {
  const patchMeta = JSON.parse(read(path.join(patchDir, 'patch.json')));
  patchPayload = {
    js: read(path.join(patchDir, 'payload.js')),
    css: fs.existsSync(path.join(patchDir, 'payload.css')) ? read(path.join(patchDir, 'payload.css')) : ''
  };
  if (patchMeta.requiresMigration && patchMeta.toSchema) {
    patchPayload.migration = { toSchema: patchMeta.toSchema };
  }
}

// ---------- template ----------
const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl" data-theme="simple">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Atlas — سامانه مدیریت سازمانی</title>
<style>
${fontCSS}
${css}
</style>
</head>
<body>
<div id="app"></div>
<div id="toast-root" aria-live="polite"></div>
<div id="modal-root"></div>
<script id="atlas-embedded-data" type="application/json">${seed}</script>
<script id="atlas-embedded-patch" type="application/json">null</script>
<script>
window.ATLAS_META = ${JSON.stringify({ appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION })};
${js}
</script>
</body>
</html>`;

// guard: </script> inside JSON would break the document
if (/<\/script/i.test(seed)) { console.error('seed contains </script>'); process.exit(1); }

fs.writeFileSync(path.join(DIST, 'Atlas.html'), html);
console.log('built dist/Atlas.html', (html.length / 1024).toFixed(0) + 'KB', 'appVersion=' + APP_VERSION, 'schemaVersion=' + SCHEMA_VERSION);

// ---------- patch package ----------
if (patchPayload) {
  const meta = JSON.parse(read(path.join(patchDir, 'patch.json')));
  const full = {
    format: 'atlas-patch',
    formatVersion: 1,
    id: meta.id,
    name: meta.name,
    nameFa: meta.nameFa,
    version: meta.version,
    description: meta.description,
    descriptionFa: meta.descriptionFa,
    publisher: meta.publisher,
    createdAt: meta.createdAt,
    minAppVersion: meta.minAppVersion,
    maxAppVersion: meta.maxAppVersion,
    minSchemaVersion: meta.minSchemaVersion,
    dependencies: meta.dependencies || [],
    conflicts: meta.conflicts || [],
    requiresMigration: !!meta.requiresMigration,
    instructions: meta.instructions || '',
    payload: patchPayload,
    integrity: { algorithm: 'sha256', payloadHash: sha256(JSON.stringify(patchPayload)) }
  };
  fs.writeFileSync(path.join(DIST, 'Atlas-patch1.json'), JSON.stringify(full, null, 2));
  console.log('built dist/Atlas-patch1.json');
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
