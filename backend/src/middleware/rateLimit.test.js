import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rateLimit } from './rateLimit.js';

function run(mw, ip) {
  let error;
  const headers = {};
  mw({ ip }, { set: (k, v) => (headers[k] = v) }, (e) => (error = e));
  return { error, headers };
}

test('allows requests up to the maximum then answers 429 with Retry-After', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 2 });
  assert.equal(run(mw, '1.1.1.1').error, undefined);
  assert.equal(run(mw, '1.1.1.1').error, undefined);
  const third = run(mw, '1.1.1.1');
  assert.equal(third.error.status, 429);
  assert.equal(third.error.code, 'RATE_LIMITED');
  assert.ok(Number(third.headers['Retry-After']) > 0);
});

test('counts each client address separately', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1 });
  assert.equal(run(mw, '1.1.1.1').error, undefined);
  assert.equal(run(mw, '2.2.2.2').error, undefined);
  assert.equal(run(mw, '1.1.1.1').error.status, 429);
});
