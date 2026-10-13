#!/usr/bin/env node
// Builds a distributable PortableStudio extension into dist/.
//
//   npm run package
//
// Always writes dist/PortableStudio-<version>/ (staged extension) and an unsigned .zip of it.
// To also produce a signed .zxp (needed for Adobe's installers), set:
//   ZXP_SIGN_CMD   path to Adobe's ZXPSignCmd (https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD)
//   ZXP_CERT       path to your .p12 certificate
//   ZXP_PASSWORD   the certificate password
// A self-signed certificate is fine for direct distribution:
//   ZXPSignCmd -selfSignedCert <country> <state> <org> <name> <password> cert.p12
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createZip } = require('../core/zip');

const ROOT = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const OUT = path.join(ROOT, 'dist');
const STAGE = path.join(OUT, `PortableStudio-${pkg.version}`);

// What ships. Tests, dev scripts and the debug file stay out.
const INCLUDE = ['CSXS', 'index.html', 'css', 'js', 'host', 'core', 'config', 'builders', 'assets', 'templates', 'mcp', 'docs',
  'LICENSE', 'README.md', 'package.json'];
const RUNTIME_DEPS = Object.keys(pkg.dependencies || {});

function copy(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dest, f));
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copies a package and (recursively) its dependencies from node_modules.
function copyDep(name, seen) {
  if (seen.has(name)) return;
  seen.add(name);
  const dir = path.join(ROOT, 'node_modules', name);
  if (!fs.existsSync(dir)) throw new Error(`Missing dependency ${name}. Run npm install first.`);
  copy(dir, path.join(STAGE, 'node_modules', name));
  const deps = Object.keys(require(path.join(dir, 'package.json')).dependencies || {});
  for (const d of deps) copyDep(d, seen);
}

function walk(dir, base = dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (fs.existsSync(src)) copy(src, path.join(STAGE, item));
}
const seen = new Set();
for (const d of RUNTIME_DEPS) copyDep(d, seen);

const files = walk(STAGE);
const zipPath = `${STAGE}.zip`;
fs.writeFileSync(zipPath, createZip(files.map((f) => ({ name: `PortableStudio/${f}`, data: fs.readFileSync(path.join(STAGE, f)) }))));
const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(1);
console.log(`Staged ${files.length} files in ${path.relative(ROOT, STAGE)}`);
console.log(`Unsigned zip: ${path.relative(ROOT, zipPath)} (${mb(zipPath)} MB)`);

const { ZXP_SIGN_CMD, ZXP_CERT, ZXP_PASSWORD } = process.env;
if (ZXP_SIGN_CMD && ZXP_CERT && ZXP_PASSWORD) {
  const zxp = `${STAGE}.zxp`;
  fs.rmSync(zxp, { force: true });
  const r = spawnSync(ZXP_SIGN_CMD, ['-sign', STAGE, zxp, ZXP_CERT, ZXP_PASSWORD, '-tsa', 'http://timestamp.digicert.com'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  console.log(`Signed: ${path.relative(ROOT, zxp)} (${mb(zxp)} MB)`);
} else {
  console.log('Not signed: set ZXP_SIGN_CMD, ZXP_CERT and ZXP_PASSWORD to build a .zxp (see the top of this file).');
}
