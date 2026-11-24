import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { requestLogger } from './requestLogger.js';

function capture(fn) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines;
}

test('logs method, path without query string, status and timing', () => {
  const res = Object.assign(new EventEmitter(), { statusCode: 200 });
  const req = { method: 'GET', path: '/api/tickets', originalUrl: '/api/tickets?q=secret' };
  const lines = capture(() => {
    requestLogger(req, res, () => {});
    res.emit('finish');
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^GET \/api\/tickets 200 [\d.]+ms$/);
});

test('skips the health check', () => {
  const res = Object.assign(new EventEmitter(), { statusCode: 200 });
  const req = { method: 'GET', path: '/api/health', originalUrl: '/api/health' };
  const lines = capture(() => {
    requestLogger(req, res, () => {});
    res.emit('finish');
  });
  assert.equal(lines.length, 0);
});
