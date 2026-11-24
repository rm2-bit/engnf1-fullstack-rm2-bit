import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify } from './classifier.js';

test('assigns each category from its keywords', () => {
  assert.equal(classify('Refund please', 'duplicate charge').category, 'BILLING');
  assert.equal(classify('Cannot sign in', 'forgot my password').category, 'LOGIN');
  assert.equal(classify('Parcel update', 'tracking shows nothing').category, 'DELIVERY');
  assert.equal(classify('App crash', 'blank screen').category, 'BUG');
  assert.equal(classify('Add dark mode', 'would love a dark theme').category, 'FEATURE_REQUEST');
});

test('first matching rule wins when several categories match', () => {
  assert.equal(classify('Refund after login error', 'cannot continue').category, 'BILLING');
});

test('matches the standalone number 500 but not longer numbers', () => {
  assert.equal(classify('Error 500 on dashboard', 'fails to load').category, 'BUG');
  assert.equal(classify('Cost is 5000', 'nothing else here').category, 'FEATURE_REQUEST');
});

test('priority rules: urgent beats high, high beats the default', () => {
  assert.equal(classify('Urgent refund', 'please').priority, 'URGENT');
  assert.equal(classify('Locked out', 'help').priority, 'URGENT');
  assert.equal(classify('Refund request', 'charged twice').priority, 'HIGH');
  assert.equal(classify('My package has not arrived', 'two weeks').priority, 'HIGH');
  assert.equal(classify('Add dark mode', 'nice to have').priority, 'MEDIUM');
});

test('is case-insensitive and deterministic', () => {
  const a = classify('REFUND', 'CHARGE');
  const b = classify('refund', 'charge');
  assert.deepEqual(a, b);
  assert.deepEqual(classify('x y z', 'a b c'), classify('x y z', 'a b c'));
});
