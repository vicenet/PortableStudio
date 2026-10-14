// Redirect safety in core/http.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { redirectTarget } = require('../core/http');

const auth = { Authorization: 'Bearer secret', Accept: 'application/json' };

test('keeps credentials on the same origin', () => {
  const r = redirectTarget('https://api.example.com/a', '/b', auth);
  assert.equal(r.url, 'https://api.example.com/b');
  assert.equal(r.headers.Authorization, 'Bearer secret');
});

test('drops credentials when the redirect changes origin', () => {
  const r = redirectTarget('https://api.example.com/a', 'https://cdn.example.net/file.zip', auth);
  assert.equal(r.headers.Authorization, undefined);
  assert.equal(r.headers.Accept, 'application/json');
});

test('refuses redirects to file:// and https -> http downgrades', () => {
  assert.throws(() => redirectTarget('https://example.com/a', 'file:///etc/passwd', auth), /file:/);
  assert.throws(() => redirectTarget('https://example.com/a', 'http://example.com/a', auth), /https to http/);
  assert.doesNotThrow(() => redirectTarget('http://example.com/a', 'https://example.com/a', auth));
});
