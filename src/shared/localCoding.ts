// Shared contract for Local Coding: source roots, immutable project versions, proposals and task events.
// The main process validates everything here; the renderer only displays it.

export type EngineId = 'codex' | 'claude';

/** Each engine runs only with a saved connection to its own provider's official endpoint. */
export const ENGINES: ReadonlyArray<{ id: EngineId; label: string; provider: 'openai' | 'anthropic'; officialBaseUrl: string; connectionLabel: string }> = [
  { id: 'codex', label: 'Codex', provider: 'openai', officialBaseUrl: 'https://api.openai.com/v1', connectionLabel: 'OpenAI' },
  { id: 'claude', label: 'Claude', provider: 'anthropic', officialBaseUrl: 'https://api.anthropic.com/v1', connectionLabel: 'Anthropic' },
];
export const isEngineId = (value: unknown): value is EngineId => ENGINES.some((engine) => engine.id === value);

export const LOCAL_CODING_LIMITS = {
  maxFiles: 10_000,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxRoots: 9,
  maxBrowseEntries: 5_000,
  maxListEntries: 1_000,
  maxSearchMatches: 200,
  maxSearchQuery: 200,
  maxReadLines: 600,
  maxReadCharacters: 80_000,
  maxProposalBytes: 4 * 1024 * 1024,
  maxImages: 6,
  maxContextMessages: 12,
} as const;

export interface SourceRoot {
  id: string;
  displayName: string;
  canonicalLocalPath: string;
  sourceKind: 'working-folder' | 'folder' | 'file';
}

export type LineEnding = 'lf' | 'crlf' | 'mixed' | 'none';

export interface FileEntry {
  /** Stable across versions: derived from the root and relative path. */
  fileId: string;
  rootId: string;
  relativePath: string;
  contentId: string;
  bytes: number;
  lines: number;
  eol: LineEnding;
  finalNewline: boolean;
  bom: boolean;
}

export type VersionKind = 'local' | 'proposal' | 'refresh';

export interface VersionSummary {
  id: string;
  kind: VersionKind;
  label: string;
  parentVersionId: string | null;
  localSnapshotId: string;
  createdAt: number;
  requestMessageId: string | null;
  proposalId: string | null;
  fileCount: number;
}

export interface ProjectVersion extends VersionSummary {
  roots: SourceRoot[];
  files: FileEntry[];
}

export interface ExcludedEntry { path: string; reason: string }

export interface SourcePreview {
  selectionId: string;
  roots: SourceRoot[];
  included: number;
  includedBytes: number;
  /** The first included files, for "View included files". */
  includedPaths: string[];
  excluded: ExcludedEntry[];
  excludedCount: number;
  /** A blocking problem: the selection cannot be captured until it is narrowed. */
  blocking: string | null;
}

export interface BrowseEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file' | 'link' | 'special';
  size?: number;
  /** Why this entry cannot be selected, when it cannot. */
  unavailable?: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  breadcrumbs: Array<{ name: string; path: string }>;
  entries: BrowseEntry[];
  truncated: boolean;
  locations: Array<{ name: string; path: string }>;
}

export interface EngineModel { id: string; name: string; efforts: string[]; highestEffort: string | null; images: boolean }

export interface EngineReadiness {
  engine: EngineId;
  label: string;
  available: boolean;
  /** Why the engine cannot run: runtime missing/corrupt, or no eligible connection. */
  problem: string | null;
  connections: Array<{ id: string; name: string }>;
}

// ── Proposal format (model output) ────────────────────────────────────────

export interface LineEdit { startLine: number; before: string[]; after: string[] }
export type ProposedChange =
  | { operation: 'edit'; sourceFileId: string; reason: string; edits: LineEdit[] }
  | { operation: 'create'; destinationRootId: string; relativePath: string; reason: string; content: string }
  | { operation: 'delete'; sourceFileId: string; reason: string };

export interface ProposalResponse {
  schemaVersion: 1;
  summary: string;
  approach: string;
  evidence: string[];
  assumptions: string[];
  questions: string[];
  changes: ProposedChange[];
  suggestedChecks: string[];
}

const stringList = { type: 'array', items: { type: 'string' } } as const;

/** JSON Schema given to every engine. A common subset: no const/oneOf/min/max, all properties required. */
export const PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'summary', 'approach', 'evidence', 'assumptions', 'questions', 'changes', 'suggestedChecks'],
  properties: {
    schemaVersion: { type: 'integer', enum: [1] },
    summary: { type: 'string' },
    approach: { type: 'string' },
    evidence: stringList,
    assumptions: stringList,
    questions: stringList,
    suggestedChecks: stringList,
    changes: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object', additionalProperties: false,
            required: ['operation', 'sourceFileId', 'reason', 'edits'],
            properties: {
              operation: { type: 'string', enum: ['edit'] },
              sourceFileId: { type: 'string' },
              reason: { type: 'string' },
              edits: {
                type: 'array',
                items: {
                  type: 'object', additionalProperties: false,
                  required: ['startLine', 'before', 'after'],
                  properties: { startLine: { type: 'integer' }, before: stringList, after: stringList },
                },
              },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['operation', 'destinationRootId', 'relativePath', 'reason', 'content'],
            properties: {
              operation: { type: 'string', enum: ['create'] },
              destinationRootId: { type: 'string' },
              relativePath: { type: 'string' },
              reason: { type: 'string' },
              content: { type: 'string' },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['operation', 'sourceFileId', 'reason'],
            properties: {
              operation: { type: 'string', enum: ['delete'] },
              sourceFileId: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        ],
      },
    },
  },
} as const;

// ── Validated results (Novi-owned metadata) ──────────────────────────────

export type ChangeOperation = 'edit' | 'create' | 'delete';

export interface ChangeSummary {
  fileId: string;
  operation: ChangeOperation;
  rootId: string;
  rootName: string;
  relativePath: string;
  reason: string;
  additions: number;
  deletions: number;
}

export interface Proposal {
  id: string;
  baseVersionId: string;
  resultingVersionId: string | null;
  summary: string;
  approach: string;
  evidence: string[];
  assumptions: string[];
  questions: string[];
  suggestedChecks: string[];
  changes: ChangeSummary[];
  engine: EngineId;
  model: string;
  reasoningEffort: string | null;
  createdAt: number;
  validation: 'verified';
  execution: 'not-run';
  repaired: boolean;
}

export type DiffLine = { type: 'context' | 'add' | 'remove'; oldNumber: number | null; newNumber: number | null; text: string };

export interface FileReview {
  fileId: string;
  operation: ChangeOperation | 'unchanged';
  rootName: string;
  relativePath: string;
  fromVersionId: string | null;
  toVersionId: string;
  fromLabel: string | null;
  toLabel: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
  /** Full proposed text, for copying; null for a deletion. */
  proposedText: string | null;
}

export type TaskState = 'preparing' | 'reading' | 'analyzing' | 'validating' | 'complete' | 'needs-information' | 'cancelled' | 'failed';

/** Stored on the assistant message: compact references only, never source contents. */
export interface LocalCodingMessage {
  taskId: string;
  projectId: string;
  baseVersionId: string;
  baseLabel: string;
  state: TaskState;
  engine: EngineId;
  model: string;
  reasoningEffort: string | null;
  proposalId: string | null;
  resultingVersionId: string | null;
  resultingLabel: string | null;
  changes: ChangeSummary[];
  progress?: string;
  /** Engine requests that could not be granted (always denied). */
  deniedRequests?: number;
}

/** Stored on the user message: the version the request was pinned to. */
export interface LocalCodingRequest { taskId: string; projectId: string; baseVersionId: string; baseLabel: string }

export interface LocalCodingBinding {
  projectId: string;
  name: string;
  engine: EngineId;
  connectionId: string;
  model: string;
}

export interface ProjectState {
  projectId: string;
  name: string;
  roots: SourceRoot[];
  versions: VersionSummary[];
  selectedVersionId: string;
  engine: EngineId;
  connectionId: string;
  connectionName: string;
  model: string;
  reasoningEffort: string | null;
  activeTaskId: string | null;
  activeTaskVersionId: string | null;
}

export type RefreshDecision = 'keep-local' | 'keep-proposed';

export interface RefreshConflict {
  fileId: string;
  rootName: string;
  relativePath: string;
  base: 'present' | 'absent';
  local: 'present' | 'absent';
  proposed: 'present' | 'absent';
}

export interface RefreshResult {
  /** The new local snapshot (always created). */
  snapshotVersionId: string;
  /** Set when carrying forward finished without conflicts, or after they were resolved. */
  resultVersionId: string | null;
  /** Pending combination id while conflicts remain unresolved. */
  pendingId: string | null;
  conflicts: RefreshConflict[];
}

export const fileLabel = (entry: { relativePath: string }, rootName?: string) => rootName ? `${rootName}/${entry.relativePath}` : entry.relativePath;
