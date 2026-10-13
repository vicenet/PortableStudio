#!/usr/bin/env node
// Builds PortableStudio release files into dist/:
//
//   PortableStudio-<v>.zxp            signed extension (Windows-signed; install with any ZXP installer)
//   PortableStudio-<v>-windows.zip    .zxp + double-click installer
//   PortableStudio-<v>-macos.zip      extension folder + double-click installer
//
//   npm run package
//
// Signing needs Adobe's ZXPSignCmd and a .p12 certificate. They are looked up (in this order) from
//   ZXP_SIGN_CMD / ZXP_CERT / ZXP_PASSWORD environment variables, or
//   a signing folder (ZXP_SIGNING_DIR, default ../PortableStudio-signing) containing
//   ZXPSignCmd(.exe), one *.p12 file and certificate-password.txt.
// Keep that folder out of the repository. Create a certificate once with:
//   ZXPSignCmd -selfSignedCert <country> <state> <org> <name> <password> cert.p12 -validityDays 3650
// Without signing tools only the unsigned macOS bundle is built.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createZip } = require('../core/zip');

const ROOT = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const OUT = path.join(ROOT, 'dist');
const NAME = `PortableStudio-${pkg.version}`;
const STAGE = path.join(OUT, NAME);
const INSTALL = path.join(ROOT, 'scripts', 'install');

// What ships. Tests, dev scripts and the .debug file stay out.
const INCLUDE = ['CSXS', 'icons', 'index.html', 'css', 'js', 'host', 'core', 'config', 'builders', 'assets', 'templates', 'mcp', 'docs',
  'LICENSE', 'README.md', 'package.json'];
const JUNK = new Set(['.DS_Store', 'Thumbs.db', '__MACOSX']);

// Copies files, never symlinks (Adobe's signing breaks on symlinks).
function copy(src, dest) {
  if (JUNK.has(path.basename(src))) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dest, f));
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Runtime dependencies are bundled into single files instead of shipping node_modules
// (thousands of files, and Adobe's ZXPSignCmd crashes on them):
//   vendor/anthropic-sdk.js  Claude SDK for AI copy (loaded by core/copy.js)
//   mcp/server.js            MCP server with its dependencies inlined
function bundle() {
  const esbuild = require('esbuild');
  esbuild.buildSync({
    entryPoints: [require.resolve('@anthropic-ai/sdk')], bundle: true, platform: 'node', format: 'cjs',
    target: 'node15', minify: true, legalComments: 'eof', outfile: path.join(STAGE, 'vendor', 'anthropic-sdk.js'), logLevel: 'error',
  });
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'mcp', 'server.js')], bundle: true, platform: 'node', format: 'cjs',
    target: 'node18', legalComments: 'eof', external: ['@anthropic-ai/sdk'], outfile: path.join(STAGE, 'mcp', 'server.js'), logLevel: 'error',
  });
}

// Licence texts of every bundled third-party package.
function thirdPartyNotices() {
  const seen = new Set();
  const out = [];
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const dir = path.join(ROOT, 'node_modules', name);
    if (!fs.existsSync(dir)) return;
    const meta = require(path.join(dir, 'package.json'));
    const lic = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    out.push(`${meta.name} ${meta.version} (${meta.license || 'see package'})\n${'-'.repeat(60)}\n` +
      (lic ? fs.readFileSync(path.join(dir, lic), 'utf8').trim() : 'Licence file not included in the package.') + '\n');
    for (const d of Object.keys(meta.dependencies || {})) visit(d);
  };
  for (const d of Object.keys(pkg.dependencies || {})) visit(d);
  fs.writeFileSync(path.join(STAGE, 'THIRD_PARTY_NOTICES.txt'),
    'PortableStudio bundles the following open-source packages.\n\n' + out.join('\n'));
  return out.length;
}

function walk(dir, base = dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(1);
const rel = (p) => path.relative(ROOT, p);
const crlf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r?\n/g, '\r\n'));
const lf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'));
const readInstall = (f) => fs.readFileSync(path.join(INSTALL, f));

function signingConfig() {
  const { ZXP_SIGN_CMD, ZXP_CERT, ZXP_PASSWORD } = process.env;
  if (ZXP_SIGN_CMD && ZXP_CERT && ZXP_PASSWORD) return { cmd: ZXP_SIGN_CMD, cert: ZXP_CERT, password: ZXP_PASSWORD };
  const dir = path.resolve(process.env.ZXP_SIGNING_DIR || path.join(ROOT, '..', 'PortableStudio-signing'));
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const cmd = files.find((f) => /^ZXPSignCmd(\.exe)?$/i.test(f));
  const cert = files.find((f) => f.toLowerCase().endsWith('.p12'));
  const pwFile = path.join(dir, 'certificate-password.txt');
  if (!cmd || !cert || !fs.existsSync(pwFile)) return null;
  return { cmd: path.join(dir, cmd), cert: path.join(dir, cert), password: fs.readFileSync(pwFile, 'utf8').trim() };
}

// ---- stage ----
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (fs.existsSync(src)) copy(src, path.join(STAGE, item));
}
bundle();
const notices = thirdPartyNotices();
const files = walk(STAGE);
console.log(`Bundled dependencies (${notices} packages listed in THIRD_PARTY_NOTICES.txt)`);
console.log(`Staged ${files.length} files in ${rel(STAGE)}`);

// ---- macOS bundle (unsigned folder + installer; signing on Windows doesn't carry over to macOS) ----
const macZip = path.join(OUT, `${NAME}-macos.zip`);
fs.writeFileSync(macZip, createZip([
  ...files.map((f) => ({ name: `${NAME}-macos/PortableStudio/${f}`, data: fs.readFileSync(path.join(STAGE, f)) })),
  { name: `${NAME}-macos/Install PortableStudio.command`, data: lf(readInstall('Install PortableStudio.command')), mode: 0o755 },
  { name: `${NAME}-macos/INSTALL.txt`, data: lf(readInstall('INSTALL.txt')) },
]));
console.log(`macOS:   ${rel(macZip)} (${mb(macZip)} MB)`);

// ---- signed .zxp + Windows bundle ----
const signing = signingConfig();
if (!signing) {
  console.log('Not signed: no signing tools found (see the top of scripts/package.js). Skipped .zxp and Windows bundle.');
  process.exit(0);
}
const zxp = path.join(OUT, `${NAME}.zxp`);
fs.rmSync(zxp, { force: true });
// No timestamp by default: ZXPSignCmd 4.1.103 crashes with -tsa. Set ZXP_TSA=<url> to add one with a fixed build.
const signArgs = ['-sign', STAGE, zxp, signing.cert, signing.password];
if (process.env.ZXP_TSA) signArgs.push('-tsa', process.env.ZXP_TSA);
const sign = spawnSync(signing.cmd, signArgs, { encoding: 'utf8' });
if (sign.status !== 0 || !fs.existsSync(zxp)) {
  console.error(sign.stdout, sign.stderr);
  throw new Error('Signing failed.');
}
const verify = spawnSync(signing.cmd, ['-verify', zxp], { encoding: 'utf8' });
console.log(`Signed:  ${rel(zxp)} (${mb(zxp)} MB) - ${(verify.stdout || verify.stderr).trim()}`);

const winZip = path.join(OUT, `${NAME}-windows.zip`);
fs.writeFileSync(winZip, createZip([
  { name: `${NAME}-windows/PortableStudio.zxp`, data: fs.readFileSync(zxp) },
  { name: `${NAME}-windows/Install PortableStudio.bat`, data: crlf(readInstall('Install PortableStudio.bat')) },
  { name: `${NAME}-windows/install-windows.ps1`, data: crlf(readInstall('install-windows.ps1')) },
  { name: `${NAME}-windows/INSTALL.txt`, data: crlf(readInstall('INSTALL.txt')) },
]));
console.log(`Windows: ${rel(winZip)} (${mb(winZip)} MB)`);
