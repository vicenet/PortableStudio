// host/lib/json.jsx gives ExtendScript a JSON object. Run it in a sandbox with no native JSON
// and check it matches Node's JSON and never executes code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'host', 'lib', 'json.jsx'), 'utf8');

function loadShim() {
  const sandbox = { pwned: false };
  sandbox.$ = { global: sandbox };
  vm.createContext(sandbox);
  vm.runInContext('delete this.JSON;', sandbox);
  vm.runInContext(src, sandbox, { filename: 'json.jsx' });
  return sandbox;
}
const shim = loadShim();
// Values from the sandbox carry its prototypes; normalise before comparing.
const norm = (v) => JSON.parse(JSON.stringify(v));
const parse = (s) => norm(shim.JSON.parse(s));

test('the shim installs its own parse and stringify', () => {
  assert.equal(typeof shim.JSON.parse, 'function');
  assert.equal(typeof shim.JSON.stringify, 'function');
  assert.doesNotMatch(src, /\beval\s*\(/);
  assert.doesNotMatch(src, /new\s+Function/);
});

test('parse matches native JSON on valid input', () => {
  const samples = [
    '{}', '[]', 'null', 'true', 'false', '0', '-12.5e3', '"text"',
    '{"a":1,"b":[true,false,null],"c":{"d":"e"}}',
    ' \n\t{ "spaced" : [ 1 , 2 ] }\r\n',
    '"esc \\" \\\\ \\/ \\b \\f \\n \\r \\t \\u00e9 \\u2603"',
    '{"brand":{"name":"Saffron Kitchen","colors":{"primary":"#E4572E"}},"pages":[1,2,3]}',
    '[1e-7, 0.5, -0, 1E+2]',
  ];
  for (const s of samples) assert.deepEqual(parse(s), norm(JSON.parse(s)), s);
});

test('parse round-trips stringify output', () => {
  const literal = '{ name: "Lumen", tags: ["brand.name", "color.primary.hex"], n: 3.25, ok: true, none: null, nested: { quote: "say \\"hi\\"\\n" } }';
  // Build the value inside the sandbox, as ExtendScript would, so instanceof Array holds.
  const text = vm.runInContext(`JSON.stringify(${literal})`, shim);
  assert.deepEqual(parse(text), norm(vm.runInNewContext(`(${literal})`)));
});

test('parse rejects invalid JSON', () => {
  const bad = [
    '', '{', '[1,]', '{"a":1,}', "{'a':1}", '{a:1}', 'undefined', 'NaN', '01', '1.', '.5',
    '"unterminated', '"bad \\x escape"', '"\\u12"', '[1 2]', '{"a" 1}', 'true false', '"tab\there"',
  ];
  for (const s of bad) assert.throws(() => shim.JSON.parse(s), (e) => e.name === 'SyntaxError', s);
});

test('parse never executes code', () => {
  const attacks = [
    'pwned = true',
    '(function(){ pwned = true; return {}; })()',
    '{"a": (pwned = true)}',
    '[1, pwned = true]',
    '{"a":1}) || (pwned = true',
  ];
  for (const s of attacks) {
    assert.throws(() => shim.JSON.parse(s), (e) => e.name === 'SyntaxError', s);
    assert.equal(shim.pwned, false, s);
  }
});
