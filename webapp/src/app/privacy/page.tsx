import type { Metadata } from 'next';
import LegalDocument from '@/components/LegalDocument';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = { title: 'Privacy — Novi', description: 'How Novi handles account information, audio, screen captures, project context, and AI provider data.' };

export default function PrivacyPage() {
  return <LegalDocument title="Privacy" updated="October 15, 2026">
    <p>This notice describes Novi’s current website and desktop app. Novi is an interview-preparation and AI workspace. Audio, screenshots, résumés, and source code can contain sensitive information; review what you provide and the destination before sending it.</p>
    <h2>Information Novi handles</h2>
    <ul>
      <li><strong>Account and access:</strong> names, usernames, password hashes, license and device records, sign-in/security events, and account changes.</li>
      <li><strong>Provider credentials:</strong> AI API keys added by an account owner. The web service encrypts managed keys at rest. Authorized owners and administrators can reveal or replace keys in API management; licensed desktop accounts can use assigned keys.</li>
      <li><strong>Your content:</strong> prompts, transcripts, attachments, screenshots, résumé/job documents, and selected project files that you choose to use.</li>
      <li><strong>Optional camera features:</strong> eye tracking uses camera frames to estimate gaze and position the answer display. Novi’s eye-tracking feature does not record or upload camera video.</li>
      <li><strong>Phone companion:</strong> when paired, your phone can send session controls, typed questions, and requested screen captures to the desktop session. Those questions or captures are sent to your configured AI provider only when used for an answer.</li>
      <li><strong>Referral payouts:</strong> Novi may need payout and tax information to pay an earned referral reward. Do not send bank-account details in ordinary email; request a secure method from Novi.</li>
    </ul>
    <h2>Where content goes</h2>
    <p>Desktop conversation history and attachments are stored on your device until you delete them or clear history. Novi’s account service does not store chat transcripts as conversation history. When you choose to send a prompt, image, audio transcription request, or project context, the relevant content is sent to the AI provider configured for that task. Cloud transcription sends audio to that provider; local transcription runs on your device. Local Coding sends the selected project snapshot/files to the configured agent provider when the agent reads them. Review that provider’s terms and privacy settings before use.</p>
    <p>The desktop app checks in with Novi’s access service to authenticate your account, validate your license, and obtain assigned provider connection details. Account and license administration records are held by Novi. Standard hosting and security logs may also be processed by service providers used to operate the website.</p>
    <p>The website uses a necessary sign-in cookie to keep an authenticated portal session. It is not an advertising cookie.</p>
    <h2>Why we use information</h2>
    <p>We use information to provide Novi, manage accounts and licenses, secure the service, answer support requests, process purchases and referral rewards, and meet legal obligations. We do not use private interview content to train Novi models. We do not control an AI provider’s independent handling of content submitted directly to its service.</p>
    <h2>Storage, deletion, and security</h2>
    <p>You can delete desktop conversations and clear local history in the app. Ordinary deletion is not forensic erasure and cannot remove data already received by an AI provider. Account/license records and security audit events may be retained after account closure where needed for accounting, dispute handling, security, or legal compliance. API credentials are encrypted on the web service; local desktop history depends on the security of your operating-system account and device.</p>
    <p>No internet-connected service can promise perfect security. Contact Novi promptly if you believe an account or credential is compromised so access can be revoked and keys rotated.</p>
    <h2>Your choices and requests</h2>
    <p>You choose whether to enable microphone, system-audio, screen-capture, and camera features. You can remove provider keys, disable connections, delete local conversations, and request account closure or access/correction/deletion of account information by contacting Novi. Some records may be retained for the reasons described above. Rights vary by location.</p>
    <h2>Children and international users</h2>
    <p>Novi is designed for adults preparing for work interviews and is not directed to children. If you use Novi outside the United States, local privacy laws may grant additional rights and may require additional notices or agreements. Contact Novi before using Novi to process another person’s sensitive information.</p>
    <h2>Changes and contact</h2>
    <p>We may update this notice as Novi’s data flows change. Material changes will be reflected here with a revised date. Questions or privacy requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
  </LegalDocument>;
}
