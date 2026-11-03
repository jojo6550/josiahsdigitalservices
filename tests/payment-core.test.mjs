// Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePayment, paymentKey } from '../public/js/payment-core.js';

const good = { name: '  Jane   Doe ', email: 'jane@example.com', ref: 'INV-1042', amount: '250.5' };

test('valid input is normalised', () => {
  const r = parsePayment(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { name: 'Jane Doe', email: 'jane@example.com', ref: 'INV-1042', amount: '250.50' });
});

test('amount must be a plain decimal within limits', () => {
  for (const amount of ['', '0', '0.99', '10000.01', '1e3', '-5', '12.345', 'abc', '0x10']) {
    assert.equal(parsePayment({ ...good, amount }).ok, false, amount);
  }
  for (const amount of ['1', '10000', '99.9', '1234.56']) {
    assert.equal(parsePayment({ ...good, amount }).ok, true, amount);
  }
});

test('rejects bad name, email and reference', () => {
  assert.equal(parsePayment({ ...good, name: 'J' }).ok, false);
  assert.equal(parsePayment({ ...good, email: 'not-an-email' }).ok, false);
  assert.equal(parsePayment({ ...good, ref: '<script>' }).ok, false);
  assert.equal(parsePayment({ ...good, ref: 'x'.repeat(61) }).ok, false);
  assert.equal(parsePayment({ ...good, ref: 'Deposit – My Website' }).ok, true);
});

test('duplicate key ignores reference case, not amount', () => {
  const a = parsePayment(good).value;
  const b = parsePayment({ ...good, ref: 'inv-1042', amount: '250.50' }).value;
  const c = parsePayment({ ...good, amount: '250.51' }).value;
  assert.equal(paymentKey(a), paymentKey(b));
  assert.notEqual(paymentKey(a), paymentKey(c));
});
