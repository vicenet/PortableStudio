// ExtendScript is ES3: make sure host scripts parse and avoid modern syntax/APIs it lacks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hostDir = path.join(__dirname, '..', 'host');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.jsx')) files.push(p);
  }
})(hostDir);
for (const f of fs.readdirSync(path.join(__dirname, '..', 'builders'))) if (f.endsWith('.jsx')) files.push(path.join(__dirname, '..', 'builders', f));

const FORBIDDEN = [
  [/\b(let|const)\s/, 'let/const'],
  [/=>/, 'arrow function'],
  [/`/, 'template literal'],
  [/\.(forEach|map|filter|indexOf|includes|find|some|every)\(\s*function/, 'array callback method'],
  [/\bObject\.(keys|assign|entries|values)\b/, 'ES5+ Object method'],
  [/\.trim\(\)/, 'String.trim'],
  [/,\s*[}\]]/, 'trailing comma'],
];

for (const file of files) {
  test(`${path.relative(hostDir, file)} is ES3-safe`, () => {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotThrow(() => new vm.Script(src, { filename: file }));
    const code = src.replace(/\/\/.*$/gm, '').replace(/'(?:\\.|[^'\\])*'/g, "''");
    for (const [re, what] of FORBIDDEN) {
      assert.ok(!re.test(code), `${what} found in ${path.basename(file)}: ${(code.match(re) || [])[0]}`);
    }
  });
}
