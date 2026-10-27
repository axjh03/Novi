import type { AppMode, BehavioralFramework, ChatMessage, VocabularyLevel } from './types';
import { DIAGRAM_SYNTAX } from './diagrams';

export const VOCABULARY_LEVELS: ReadonlyArray<{ id: VocabularyLevel; name: string; instructions: string }> = [
  { id: 'plain', name: 'Plain', instructions: 'Use familiar words and short sentences. Explain technical terms in everyday language when they are needed. Keep the reasoning and technical detail appropriate to the question and role.' },
  { id: 'everyday', name: 'Everyday', instructions: 'Use natural, conversational language. Include common professional terms and briefly explain unfamiliar ones. Keep answers easy to say aloud.' },
  { id: 'technical', name: 'Technical', instructions: 'Use precise professional and technical vocabulary appropriate to the question and target role. Explain rare terms on first use. Keep sentences clear and avoid inflated or needlessly complex wording.' },
];

export const SESSION_MODES: Array<{ id: AppMode; name: string; description: string; instructions: string }> = [
  { id: 'normal', name: 'Chat', description: 'General questions and everyday help.', instructions: 'Lead with a direct answer. Keep ordinary answers and follow-ups concise unless the user asks for detail. Preserve user constraints and needed correctness checks.' },
  { id: 'recruiter', name: 'Recruiter Call', description: 'Introductions, motivation, role fit, and logistics.', instructions: 'Give a concise, natural 30–60 second answer focused on role fit, motivation, and relevant experience. For salary, availability, or work authorization, use only supplied facts; ask when missing. Avoid unnecessary technical depth.' },
  { id: 'coding', name: 'Code', description: 'Coding interviews, algorithms, and SQL.', instructions: 'Lead with the solution or a necessary clarification. Provide complete runnable code in a language-tagged fence and a concise explanation in this same response, including complexity and relevant edge cases. Follow the requested language and all user constraints. Do not claim execution unless verified.' },
  { id: 'technical', name: 'Technical Phone/Video Screen', description: 'Technical fundamentals, project deep dives, and reasoning.', instructions: 'Lead with a direct answer, explain how and why, then give one relevant example or trade-off. Clarify ambiguous questions. Match technical depth to the target role and experience level. Use code only when asked or necessary.' },
  { id: 'system-design', name: 'System Design', description: 'Requirements, architecture diagrams, failures, and trade-offs.', instructions: 'First clarify features, users, scale, latency, and consistency. State assumptions. Explain client, API, services, storage, caches, and queues only as needed. Walk through data flow, failure handling, bottlenecks, and trade-offs. Justify choices rather than listing technologies. Do not write implementation code. Draw Mermaid diagrams when requested.' },
  { id: 'behavioral', name: 'Behavioral Interview', description: 'Experience stories, collaboration, ownership, and impact.', instructions: 'Use a concise 60–90 second story with situation, task, personal action, result, and a lesson. Use only experience provided in sources or conversation; ask for a missing example rather than inventing one. Answer simple follow-ups directly.' },
  { id: 'local-coding', name: 'Local Coding', description: 'A read-only coding agent over a project folder on this computer.', instructions: 'Answer coding questions about the selected local project. Code changes are proposals only and are never applied or run.' },
];
export const NATURAL_VOICE = "Sound like a thoughtful person speaking: use contractions, short sentences, varied phrasing, and plain words. An occasional 'um', 'well', or 'let me think' is fine when natural, but do not add fillers to every answer. Avoid corporate buzzwords, theatrical enthusiasm, and repetitive summaries.";
export function isAppMode(value: unknown): value is AppMode { return SESSION_MODES.some((mode) => mode.id === value); }
export function modeInstructions(mode: AppMode, framework: BehavioralFramework = 'smart'): string {
  if (mode === 'normal') return SESSION_MODES[0].instructions;
  return `${SESSION_MODES.find((item) => item.id === mode)!.instructions}\n${mode === 'system-design' ? DIAGRAM_SYNTAX : ''}\n${mode === 'behavioral' ? `Framework: ${framework === 'smart' ? 'choose STAR, CAR, PAR, or SOAR only when appropriate to the question' : framework.toUpperCase()}.` : ''}\n${NATURAL_VOICE}\nFollow the session's additional instructions and requested output style over these defaults. Tailor answers to the specified role and level of experience. Treat the resume and sources as factual reference; never invent experience, employers, or metrics.`;
}
export const DRAW_DIAGRAM_PROMPT = 'Draw or update the system design diagram using the conversation, latest transcript, and attached images. If there is no system design question, ask for it instead of inventing a design. If requirements are ambiguous, state assumptions or ask a focused question. Compare with the latest diagram: if there is no meaningful architecture change and its syntax is valid, reply "No diagram changes needed" without a code fence. Otherwise return a complete replacement architecture in one fenced mermaid block (flowchart), preceded by a short title. Preserve unchanged components and explain only meaningful changes. Do not include implementation code. ' + DIAGRAM_SYNTAX;

/** These modes use the same answer in chat and on the gaze HUD. */
export function hudResponse(mode: AppMode, messages: Pick<ChatMessage, 'role' | 'content'>[]): string | null {
  if (!['normal', 'recruiter', 'technical', 'behavioral'].includes(mode)) return null;
  return [...messages].reverse().find(message => message.role === 'assistant')?.content ?? '';
}
