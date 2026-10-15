import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCED_FEATURES, CONTACT_EMAIL, CORE_FEATURES, isPlanId, mailto, PLANS } from '../src/lib/site';

test('public plans match the published prices, billing terms, and device allowances', () => {
  assert.deepEqual(Object.entries(PLANS).map(([id, plan]) => [id, plan.price, plan.unit, plan.devices]), [
    ['essential', '$16.99', '/ month', '1 device'],
    ['pro', '$25', '/ month', '1 device'],
    ['plus', '$30', '/ month', '2 devices maximum'],
    ['lifetime', '$299', 'one-time', 'Unlimited devices'],
  ]);
  assert.deepEqual(PLANS.essential.features, CORE_FEATURES);
  assert.deepEqual(PLANS.pro.features, ['Everything in Essential', ...ADVANCED_FEATURES]);
  assert.equal(PLANS.plus.features[0], 'Everything in Pro');
  assert.equal(PLANS.lifetime.features[0], 'Everything in Plus');
});

test('plan query parameters reject legacy categories, arrays, and object properties', () => {
  for (const value of Object.keys(PLANS)) assert.equal(isPlanId(value), true);
  for (const value of ['student', 'individual', 'consultancy', '__proto__', 'constructor', ['pro'], '', null, undefined]) {
    assert.equal(isPlanId(value), false);
  }
});

test('access and sales email links preserve the recipient and safely encode request details', () => {
  const subject = 'Novi access request: Pro & Plus';
  const body = 'Name: Alex & Sam\nPlan: Lifetime ($299 one-time)\nDevices: Unlimited devices';
  const link = new URL(mailto(subject, body));
  assert.equal(link.pathname, CONTACT_EMAIL);
  assert.equal(link.searchParams.get('subject'), subject);
  assert.equal(link.searchParams.get('body'), body);
  assert.equal(new URL(mailto('Sales enquiry')).searchParams.has('body'), false);
});
