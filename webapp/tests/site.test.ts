import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCED_FEATURES, CONTACT_EMAIL, CORE_FEATURES, referralCode, isPlanId, mailto, PLANS } from '../src/lib/site';

test('public plans match the published prices and billing terms', () => {
  assert.deepEqual(Object.entries(PLANS).map(([id, plan]) => [id, plan.price, plan.unit]), [
    ['core', '$16', '/ month'],
    ['pro', '$45', '/ month'],
    ['ultimate', '$90', '/ month'],
    ['lifetime', '$399', 'one-time'],
  ]);
  assert.deepEqual(PLANS.core.features, CORE_FEATURES);
  assert.deepEqual(PLANS.pro.features, ['Everything in Core', ...ADVANCED_FEATURES]);
  assert.equal(PLANS.ultimate.features[0], 'Everything in Pro');
  assert.equal(PLANS.lifetime.features[0], 'Everything in Pro');
});

test('plan query parameters reject legacy categories, arrays, and object properties', () => {
  for (const value of Object.keys(PLANS)) assert.equal(isPlanId(value), true);
  for (const value of ['student', 'individual', 'consultancy', '__proto__', 'constructor', ['pro'], '', null, undefined]) {
    assert.equal(isPlanId(value), false);
  }
});

test('access and sales email links preserve the recipient and safely encode request details', () => {
  const subject = 'Novi access request: Pro & Plus';
  const body = 'Name: Alex & Sam\nPlan: Lifetime ($399 one-time)';
  const link = new URL(mailto(subject, body));
  assert.equal(link.pathname, CONTACT_EMAIL);
  assert.equal(link.searchParams.get('subject'), subject);
  assert.equal(link.searchParams.get('body'), body);
  assert.equal(new URL(mailto('Sales enquiry')).searchParams.has('body'), false);
});


test('referral codes preserve attribution and cannot inject email lines', () => {
  assert.equal(referralCode('FRIEND-42'), 'FRIEND-42');
  assert.equal(referralCode(['FIRST', 'SECOND']), '');
  assert.equal(referralCode(undefined), '');
  assert.equal(referralCode('friend\r\nPlan: free'), 'friendPlan: free');
  assert.equal(referralCode('x'.repeat(100)).length, 80);
});
