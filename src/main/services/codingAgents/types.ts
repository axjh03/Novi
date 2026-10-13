import type { EngineId, EngineModel } from '../../../shared/localCoding';

/** The only capabilities an engine gets: reading one pinned virtual version. */
export interface AgentTools {
  list(args: { scope?: unknown; cursor?: unknown }): string;
  search(args: { query?: unknown; scope?: unknown; cursor?: unknown; caseSensitive?: unknown }): Promise<string>;
  read(args: { fileId?: unknown; startLine?: unknown; endLine?: unknown }): string;
}

export interface AgentImage { mimeType: string; base64: string }

export interface AgentTask {
  model: string;
  /** Exactly the effort shown to the user; null when the model has no effort setting. */
  effort: string | null;
  instructions: string;
  prompt: string;
  images: AgentImage[];
  schema: Record<string, unknown>;
  tools: AgentTools;
  signal: AbortSignal;
  onProgress(state: 'reading' | 'analyzing', detail?: string): void;
  /** An engine asked for something outside the read-only tools; it was denied. */
  onDenied(what: string): void;
}

export interface AgentCredential { apiKey: string }

export interface CodingAgent {
  readonly id: EngineId;
  /** Returns the final structured answer (object or JSON text). Throws on failure or cancellation. */
  run(task: AgentTask, credential: AgentCredential): Promise<unknown>;
  listModels(credential: AgentCredential, signal: AbortSignal): Promise<EngineModel[]>;
}

export const TOOL_DESCRIPTIONS = {
  list_files: 'List files in the pinned project version. Returns fileId, path and line count. Use scope (a path prefix like "app/src") to narrow, and cursor to page.',
  search_files: 'Search the pinned project version for literal text (case-insensitive unless caseSensitive is true). Returns fileId, path:line and the line.',
  read_file: 'Read a file of the pinned project version by fileId. Returns numbered lines; use startLine/endLine for long files.',
} as const;

// Common JSON Schema subset accepted by both engines (no unions or numeric bounds).
export const TOOL_SCHEMAS = {
  list_files: { type: 'object', additionalProperties: false, properties: { scope: { type: 'string', description: 'Optional path prefix.' }, cursor: { type: 'integer', description: 'From a previous call.' } } },
  search_files: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string' }, scope: { type: 'string' }, cursor: { type: 'integer' }, caseSensitive: { type: 'boolean' } } },
  read_file: { type: 'object', additionalProperties: false, required: ['fileId'], properties: { fileId: { type: 'string' }, startLine: { type: 'integer' }, endLine: { type: 'integer' } } },
} as const;

export const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/** Highest listed effort by the known order. Unknown names are not guessed at. */
export function highestEffort(efforts: string[]): string | null {
  let best: string | null = null;
  for (const effort of efforts) if (EFFORT_ORDER.includes(effort) && (best === null || EFFORT_ORDER.indexOf(effort) > EFFORT_ORDER.indexOf(best))) best = effort;
  return best;
}

/** Runs a tool call and turns its errors into text the model can act on. Counts every call. */
export async function callTool(tools: AgentTools, name: string, args: unknown, onProgress: AgentTask['onProgress']): Promise<{ text: string; ok: boolean }> {
  const input = args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {};
  try {
    if (name === 'list_files') { onProgress('reading', 'Listing files'); return { text: tools.list(input), ok: true }; }
    if (name === 'search_files') { onProgress('reading', `Searching for “${String(input.query ?? '').slice(0, 60)}”`); return { text: await tools.search(input), ok: true }; }
    if (name === 'read_file') {
      const text = tools.read(input);
      onProgress('reading', `Reading ${text.slice(0, text.indexOf(' (fileId')).slice(0, 120)}`);
      return { text, ok: true };
    }
    return { text: `Unknown tool ${name}.`, ok: false };
  } catch (error) {
    return { text: error instanceof Error ? error.message : 'The tool call failed.', ok: false };
  }
}
