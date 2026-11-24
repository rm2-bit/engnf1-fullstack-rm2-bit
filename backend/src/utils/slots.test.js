import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSlot } from './slots.js';

const now = new Date('2030-01-01T00:00:00Z');
const bad = { code: 'VALIDATION_ERROR' };

test('accepts a valid 60 minute slot and returns Date objects', () => {
  const { start, end } = validateSlot('2030-01-01T10:00:00Z', '2030-01-01T11:00:00Z', now);
  assert.equal(start.toISOString(), '2030-01-01T10:00:00.000Z');
  assert.equal(end - start, 60 * 60_000);
});

test('accepts the 30 and 240 minute boundaries', () => {
  validateSlot('2030-01-01T10:00:00Z', '2030-01-01T10:30:00Z', now);
  validateSlot('2030-01-01T10:00:00Z', '2030-01-01T14:00:00Z', now);
});

test('rejects times that are not on the :00 or :30 grid', () => {
  assert.throws(() => validateSlot('2030-01-01T10:15:00Z', '2030-01-01T11:00:00Z', now), bad);
  assert.throws(() => validateSlot('2030-01-01T10:00:30Z', '2030-01-01T11:00:00Z', now), bad);
});

test('rejects end before or equal to start', () => {
  assert.throws(() => validateSlot('2030-01-01T11:00:00Z', '2030-01-01T10:00:00Z', now), bad);
  assert.throws(() => validateSlot('2030-01-01T10:00:00Z', '2030-01-01T10:00:00Z', now), bad);
});

test('rejects durations above 240 minutes', () => {
  assert.throws(() => validateSlot('2030-01-01T10:00:00Z', '2030-01-01T14:30:00Z', now), bad);
});

test('rejects past starts and starts more than 30 days away', () => {
  assert.throws(() => validateSlot('2029-12-31T10:00:00Z', '2029-12-31T11:00:00Z', now), bad);
  assert.throws(() => validateSlot('2030-02-05T10:00:00Z', '2030-02-05T11:00:00Z', now), bad);
});

test('rejects timestamps that are not ISO 8601 UTC', () => {
  assert.throws(() => validateSlot('2030-01-01 10:00', '2030-01-01 11:00', now), bad);
  assert.throws(() => validateSlot('2030-01-01T10:00:00+05:30', '2030-01-01T11:00:00+05:30', now), bad);
});
