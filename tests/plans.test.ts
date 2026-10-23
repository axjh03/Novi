import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fallbackMode, FEATURES, featureName, isFeature, isLicensePlan, LICENSE_PLANS, lockedMessage, PLAN_FEATURES, planTag } from '../src/shared/plans';
import { SESSION_MODES } from '../src/shared/sessionModes';

test('each plan unlocks what the website sells', () => {
  const plansWith = (feature: Parameters<typeof lockedMessage>[0]) => LICENSE_PLANS.filter((plan) => PLAN_FEATURES[plan].includes(feature));
  // Core: Technical Screen and Behavioral Interview. Pro adds Chat, Recruiter Call, Code, System Design
  // and eye tracking. Ultimate adds Local Coding and the phone companion. Lifetime is the Pro toolkit.
  for (const feature of ['technical', 'behavioral'] as const) assert.deepEqual(plansWith(feature), ['CORE', 'PRO', 'ULTIMATE', 'LIFETIME'], feature);
  for (const feature of ['normal', 'recruiter', 'coding', 'system-design', 'eye-tracking'] as const) assert.deepEqual(plansWith(feature), ['PRO', 'ULTIMATE', 'LIFETIME'], feature);
  for (const feature of ['local-coding', 'phone-companion'] as const) assert.deepEqual(plansWith(feature), ['ULTIMATE'], feature);
  assert.deepEqual(PLAN_FEATURES.LIFETIME, PLAN_FEATURES.PRO);
  // Old apps unlock everything, which is why the server lets them use Ultimate licenses only.
  assert.deepEqual([...PLAN_FEATURES.ULTIMATE].sort(), [...FEATURES].sort());
  assert.deepEqual([...new Set(FEATURES)], [...FEATURES], 'no feature listed twice');
  for (const mode of SESSION_MODES) assert(FEATURES.includes(mode.id), `${mode.id} belongs to a plan`);
});

test('plan and feature checks accept only known ids', () => {
  for (const plan of LICENSE_PLANS) assert(isLicensePlan(plan));
  for (const value of ['pro', 'GOLD', '', null, undefined, ['PRO'], 'toString', '__proto__']) assert(!isLicensePlan(value), String(value));
  assert(isFeature('local-coding'));
  for (const value of ['Local Coding', 'remote-files', '', 1, null, 'constructor']) assert(!isFeature(value), String(value));
});

test('locks name the plans that include a feature', () => {
  assert.equal(lockedMessage('coding'), 'Code is included with Pro, Ultimate and Lifetime. Ask your Novi administrator to upgrade your license.');
  assert.equal(lockedMessage('local-coding'), 'Local Coding is included with Ultimate. Ask your Novi administrator to upgrade your license.');
  assert.equal(lockedMessage('phone-companion'), 'Phone companion is included with Ultimate. Ask your Novi administrator to upgrade your license.');
  assert.equal(featureName('eye-tracking'), 'Eye tracking');
  assert.equal(featureName('normal'), 'Chat');
  assert.deepEqual(['normal', 'eye-tracking', 'local-coding', 'technical'].map((feature) => planTag(feature as never)), ['Pro', 'Pro', 'Ultimate', 'Core']);
});

test('a locked mode falls back to Chat, or to Technical on Core', () => {
  assert.equal(fallbackMode(PLAN_FEATURES.CORE), 'technical');
  assert.equal(fallbackMode(PLAN_FEATURES.PRO), 'normal');
  assert.equal(fallbackMode(PLAN_FEATURES.LIFETIME), 'normal');
  assert.equal(fallbackMode(undefined), 'normal', 'no plan information locks nothing');
  for (const plan of LICENSE_PLANS) assert(PLAN_FEATURES[plan].includes(fallbackMode(PLAN_FEATURES[plan])), plan);
});
