// Cloudflare Pages build (v2.9.0): copies only the files the site serves into dist/, so the backend source, tests and
// tooling in this repo are never published. Pages settings: build command "node scripts/build-pages.js",
// build output directory "dist", production branch "main".
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const SITE = ['index.html', 'app.js', 'config.js', 'assets', '_headers'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const item of SITE) {
  const from = path.join(ROOT, item);
  if (!fs.existsSync(from)) throw new Error(`Missing ${item}`);
  fs.cpSync(from, path.join(OUT, item), { recursive: true });
}
console.log(`Pages build: ${SITE.join(', ')} -> dist/`);
