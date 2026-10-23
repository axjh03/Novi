import { Lock } from 'lucide-react';
import { planTag, type Feature } from '../../../shared/plans';

/**
 * The small lock-and-plan tag ("Pro" or "Ultimate") on a feature the license's plan doesn't include.
 *
 * Locked features stay visible, so nobody wonders where one went. The control it sits in is marked
 * `aria-disabled` and `plan-locked`, and says why when pressed (see lockedMessage in
 * src/shared/plans.ts). The main process refuses the feature either way.
 *
 * A <small>, not a <span>, so the rules that hide mode labels in narrow layouts never hide the lock.
 */
export function PlanLock({ feature }: { feature: Feature }) {
  return <small className="plan-lock"><Lock size={10} aria-hidden="true" />{planTag(feature)}</small>;
}
