#!/usr/bin/env node
// Collects the static site for GitHub Pages into a folder (default _site/).
//   node tools/build-site.js [outDir] [version]
//
// Pages lets browsers cache every file for a while, and a phone that keeps the
// old src/main.js next to a new index.html runs the old code against the new
// page: screens overlap and new buttons do nothing. So the code and styles go
// under v/<version>/ (the commit, by default) and index.html points there: a
// new release is a new set of addresses, and nothing old can be mixed in.
// Relative imports inside src/ keep working because the folders move together.
// The files themselves are copied unchanged.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || '_site');
const version = (process.argv[3] || process.env.GITHUB_SHA || gitSha()).slice(0, 12);
if (!/^[\w.-]+$/.test(version)) throw new Error(`bad version "${version}"`);

function gitSha() {
  try { return execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); } catch { return `t${Date.now()}`; }
}

/** Folders that change with the code; they move under v/<version>/. */
const VERSIONED = ['src', 'styles', 'vendor'];
/** Files whose addresses must stay put (the manifest and icons are bookmarked by the phone). */
const FIXED = ['manifest.webmanifest', 'icons'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const base = `v/${version}`;
for (const dir of VERSIONED) fs.cpSync(path.join(root, dir), path.join(out, base, dir), { recursive: true });
for (const f of FIXED) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let swaps = 0;
html = html.replace(/(\s(?:src|href)=")((?:src|styles|vendor)\/[^"]+)"/g, (_, attr, url) => {
  swaps++;
  return `${attr}${base}/${url}"`;
});
if (!html.includes(`${base}/src/main.js`)) throw new Error('index.html no longer loads src/main.js; update tools/build-site.js');
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta name="popsim-version" content="${version}">`);
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`site in ${path.relative(root, out) || '.'}: version ${version}, ${swaps} addresses moved under ${base}/`);
