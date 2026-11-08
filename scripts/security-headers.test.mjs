import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The SPA's production headers live in one file; `vite preview` reads it, and the nginx example
// must repeat it word for word (TQR-022).
const root = new URL('../', import.meta.url);
const headers = JSON.parse(readFileSync(new URL('deploy/security-headers.json', root), 'utf8'));
const nginx = readFileSync(new URL('deploy/nginx.conf.example', root), 'utf8');

/** `add_header Name "value" always;` lines of the nginx example, as a name → value map. */
const addHeaders = () => {
  const found = new Map();
  for (const match of nginx.matchAll(/^\s*add_header\s+(\S+)\s+"([^"]*)"\s+always;/gm)) {
    found.set(match[1], match[2]);
  }
  return found;
};

test('the nginx example sends every SPA header with the same value', () => {
  const found = addHeaders();
  for (const [name, value] of Object.entries(headers)) {
    assert.equal(found.get(name), value, name);
  }
});

test('the nginx example adds HSTS (HTTPS is terminated there) and nothing unexpected', () => {
  const found = addHeaders();
  assert.match(found.get('Strict-Transport-Security') ?? '', /^max-age=\d{8,}/);
  assert.deepEqual(
    [...found.keys()].filter((name) => !(name in headers)),
    ['Strict-Transport-Security'],
  );
});

test('the CSP keeps the baseline directives of docs/security.md', () => {
  const csp = headers['Content-Security-Policy'];
  for (const directive of [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "connect-src 'self'",
  ]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.ok(!csp.includes("'unsafe-eval'"), 'no unsafe-eval');
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'no inline scripts');
});

test('the vite preview server reads the same file', () => {
  const vite = readFileSync(new URL('web/vite.config.ts', root), 'utf8');
  assert.match(vite, /deploy\/security-headers\.json/);
});
