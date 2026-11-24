import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  enumValue,
  escapeLike,
  isUuid,
  paginated,
  parsePaging,
  positiveInt,
  validateEmail,
  validatePassword,
} from './validate.js';

const bad = { code: 'VALIDATION_ERROR' };

test('validateEmail trims and lowercases, and rejects malformed input', () => {
  assert.equal(validateEmail('  Agent@Example.COM '), 'agent@example.com');
  assert.throws(() => validateEmail('not-an-email'), bad);
  assert.throws(() => validateEmail(42), bad);
  assert.throws(() => validateEmail(`${'a'.repeat(250)}@x.io`), bad);
});

test('validatePassword needs 8-64 characters with a letter and a digit', () => {
  assert.equal(validatePassword('Passw0rd1'), 'Passw0rd1');
  assert.throws(() => validatePassword('short1'), bad);
  assert.throws(() => validatePassword('onlyletters'), bad);
  assert.throws(() => validatePassword('12345678'), bad);
  assert.throws(() => validatePassword(`a1${'x'.repeat(70)}`), bad);
});

test('escapeLike makes % _ and backslash literal', () => {
  assert.equal(escapeLike('100%'), '100\\%');
  assert.equal(escapeLike('a_b'), 'a\\_b');
  assert.equal(escapeLike('a\\b'), 'a\\\\b');
  assert.equal(escapeLike("x'; DROP TABLE tickets;--"), "x'; DROP TABLE tickets;--");
});

test('enumValue only allows listed values', () => {
  assert.equal(enumValue('BUG', ['BUG', 'LOGIN'], 'category'), 'BUG');
  assert.throws(() => enumValue('bug', ['BUG', 'LOGIN'], 'category'), bad);
});

test('parsePaging applies defaults and rejects invalid pages', () => {
  assert.deepEqual(parsePaging({}), { page: 1, pageSize: 10, offset: 0 });
  assert.equal(parsePaging({ page: '3' }).offset, 20);
  assert.throws(() => parsePaging({ page: '0' }), bad);
  assert.throws(() => parsePaging({ page: 'abc' }), bad);
});

test('parsePaging honours limit only when allowed and within the maximum', () => {
  assert.equal(parsePaging({ limit: '50' }).pageSize, 10);
  assert.equal(parsePaging({ limit: '50' }, { allowLimit: true }).pageSize, 50);
  assert.throws(() => parsePaging({ limit: '500' }, { allowLimit: true, maxSize: 100 }), bad);
});

test('positiveInt and paginated behave as documented', () => {
  assert.equal(positiveInt('7', 'n'), 7);
  assert.throws(() => positiveInt('-1', 'n'), bad);
  const out = paginated([1, 2], { page: 2, pageSize: 10 }, 25);
  assert.equal(out.totalPages, 3);
  assert.equal(out.total, 25);
});

test('isUuid accepts UUIDs and rejects other strings', () => {
  assert.equal(isUuid('0da19280-aee1-47bf-8c0e-42b11c548e43'), true);
  assert.equal(isUuid('123'), false);
  assert.equal(isUuid(undefined), false);
});
