import type { Metadata } from 'next';
import LegalDocument from '@/components/LegalDocument';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = { title: 'Referral terms — Novi', description: 'Eligibility, attribution, rewards, and payout terms for the Novi referral program.' };

export default function ReferralTermsPage() {
  return <LegalDocument title="Referral program terms" updated="October 15, 2026">
    <p>The Novi referral program pays a cash reward equal to 50% of eligible amounts Novi actually receives from a new customer referred by you. These terms explain eligibility and payout. The program is currently administered manually; request enrollment and written attribution confirmation from <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> before referring a purchase.</p>
    <h2>Eligible purchases and attribution</h2>
    <ul>
      <li>The referred customer must be new to Novi and identify your referral code or link before payment. Novi confirms attribution in writing.</li>
      <li>For a monthly plan, the reward is 50% of each successfully collected monthly plan payment for the referred customer. A Lifetime purchase earns 50% of its one-time plan payment.</li>
      <li>Rewards are calculated on the plan price actually received by Novi, after discounts and excluding taxes, refunds, and chargebacks. No reward is due on an unpaid request, a refunded payment, or a chargeback.</li>
      <li>Self-referrals, duplicate accounts, fraudulent orders, and referrals obtained through misleading or unlawful conduct do not qualify.</li>
    </ul>
    <h2>Payouts and taxes</h2>
    <p>Novi will confirm the amount and payout method with you and issue eligible rewards within 30 days after the related payment clears. Do not email bank account details; ask Novi for the secure payout method. You are responsible for your own tax obligations. Novi may request information needed to verify identity, prevent fraud, or meet tax and payment laws, and may report payouts when required.</p>
    <h2>Promotion rules</h2>
    <p>Make truthful statements about Novi and disclose clearly that you may earn a commission when someone purchases through your referral. Do not promise hiring outcomes, claim Novi is undetectable, impersonate Novi or an employer, spam people, or use misleading ads. You are responsible for following advertising, email, and platform rules. Novi may ask you to correct or remove a non-compliant promotion.</p>
    <h2>Changes and disputes</h2>
    <p>Novi may change or end the program prospectively. Rewards already earned for eligible cleared payments will still be paid, except where a payment is reversed or fraud is involved. Novi will provide written notice of any change that affects future referrals. Contact <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with questions.</p>
  </LegalDocument>;
}
