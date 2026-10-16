import type { Metadata } from 'next';
import LegalDocument from '@/components/LegalDocument';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = { title: 'Terms — Novi', description: 'Terms for using Novi desktop software, website, and plans.' };

export default function TermsPage() {
  return <LegalDocument title="Terms of use" updated="October 15, 2026">
    <p>These terms apply when you access Novi’s website or desktop software. By using Novi, you agree to use it lawfully and follow these terms. If you do not agree, do not use the service.</p>
    <h2>What Novi does</h2>
    <p>Novi provides software for interview preparation, transcription, coding practice, and AI-assisted work. Novi can produce inaccurate, incomplete, or outdated output. You are responsible for reviewing it and deciding whether it is appropriate. Novi does not guarantee an interview result, job offer, hiring decision, or that an answer is correct.</p>
    <h2>Permission and acceptable use</h2>
    <p>Use audio, camera, screen capture, documents, and source code only when you have the rights and permissions required by law, your employer, the interview host, and any applicable platform rules. Tell other participants and obtain their consent where required before capturing or transcribing a conversation. Do not use Novi to secretly record people, misrepresent another person, violate confidentiality obligations, infringe rights, or submit work in a process that prohibits AI assistance.</p>
    <p>You are responsible for the materials you provide and for checking that you may share them with your selected AI provider. Do not upload trade secrets, personal information, or confidential employer/client code unless you are authorized to do so.</p>
    <p>Novi may suspend or end access when reasonably necessary to address a security threat, unlawful use, non-payment, or a material breach of these terms, subject to rights that cannot be limited under applicable law.</p>
    <h2>AI providers and data</h2>
    <p>Novi may send prompts, audio, images, and selected project files to the provider/model you configure. Those submissions are also governed by that provider’s terms and privacy practices. API usage is billed separately by the provider unless Novi explicitly states otherwise. Keep API keys secure and rotate them if exposed.</p>
    <h2>Plans, access, and payment</h2>
    <p>Plan features, prices, and terms are described on the pricing page. The current access-request page does not process card payments; payment and activation are arranged separately with Novi. No recurring charge is made through that page. Novi will confirm applicable refund and cancellation terms before accepting payment. Before any future automatic renewal or online charge, Novi will disclose the price, timing, and cancellation terms and obtain required consent.</p>
    <p>Lifetime means lifetime access to the Novi software features listed for the Lifetime plan, subject to these terms and continued availability of the service. It does not include third-party AI provider usage, and it does not include features marked Ultimate-only.</p>
    <h2>Software, ownership, and feedback</h2>
    <p>Novi and its software, branding, and original materials are owned by Novi or its licensors. Novi grants you a limited, non-exclusive, non-transferable license to use the software for your own lawful purposes while your access is active. You retain rights to content you provide. You may send feedback; Novi may use it to improve the product without identifying you.</p>
    <h2>Availability and changes</h2>
    <p>We may update, suspend, or discontinue a feature for maintenance, security, legal, or operational reasons. We will make reasonable efforts to communicate material changes. Nothing in these terms limits rights that cannot be limited under applicable law.</p>
    <h2>Contact</h2>
    <p>Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
  </LegalDocument>;
}
