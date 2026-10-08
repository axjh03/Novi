import { AccessError } from './access-policy';
import { authenticate } from './access';
import { prisma } from './db';

export interface FileItem {
  name: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
  path: string;
}

export interface FileCommand {
  id: string;
  sessionId: string;
  action: 'list_dir' | 'read_file' | 'zip_folder';
  path?: string;
  createdAt: number;
}

export interface FileResponse {
  commandId: string;
  error?: string;
  items?: FileItem[];
  currentPath?: string;
  base64Data?: string;
  filename?: string;
  mimeType?: string;
}

// In-memory on-demand command queue & response cache
const pendingCommands = new Map<string, FileCommand[]>();
const completedResponses = new Map<string, FileResponse>();
const activeExplorerSessions = new Set<string>();

export async function handleFileExplorerAdmin(req: Request, action: string, body?: any) {
  const { account, session } = await authenticate(req);
  if (session.audience !== 'portal' || account.role !== 'ADMIN') {
    throw new AccessError('Administrator access required.', 403);
  }

  if (action === 'command' && req.method === 'POST') {
    const payload = (body && typeof body === 'object' ? body : await req.json().catch(() => ({}))) as {
      sessionId: string;
      action: 'list_dir' | 'read_file' | 'zip_folder';
      path?: string;
      pin?: string;
    };

    if (!payload?.sessionId || typeof payload.sessionId !== 'string') {
      throw new AccessError('Target device session ID is required.', 400);
    }
    if (!payload?.action) {
      throw new AccessError('File explorer action is required.', 400);
    }
    if (!['list_dir', 'read_file', 'zip_folder'].includes(payload.action)) {
      throw new AccessError('Invalid file explorer action.', 400);
    }
    // PIN is an extra lock on the admin-authenticated explorer, not a replacement for sign-in.
    if (payload.pin !== '3050') throw new AccessError('Incorrect Lock PIN.', 403);

    // Verify session exists and is active (graceful on DB check)
    try {
      const targetSession = await prisma.accessSession.findUnique({
        where: { id: payload.sessionId },
      });
      if (targetSession && (targetSession.revokedAt || targetSession.expiresAt <= new Date())) {
        throw new AccessError('This device session has expired or been revoked.', 404);
      }
    } catch (err: any) {
      if (err instanceof AccessError) throw err;
      console.warn('[RemoteFileExplorer] Session DB check notice:', err?.message || err);
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const command: FileCommand = {
      id: commandId,
      sessionId: payload.sessionId,
      action: payload.action,
      path: payload.path || '',
      createdAt: Date.now(),
    };

    activeExplorerSessions.add(payload.sessionId);
    const existing = pendingCommands.get(payload.sessionId) || [];
    pendingCommands.set(payload.sessionId, [...existing, command]);

    // Wait up to 15 seconds for desktop client to poll and respond
    const timeout = Date.now() + 15000;
    while (Date.now() < timeout) {
      if (completedResponses.has(commandId)) {
        const resp = completedResponses.get(commandId)!;
        completedResponses.delete(commandId);
        if (resp.error) throw new AccessError(resp.error, 500);
        return resp;
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    throw new AccessError('Device response timed out. Ensure Novi desktop is running and signed in.', 504);
  }

  if (action === 'stop' && req.method === 'POST') {
    const payload = (body && typeof body === 'object' ? body : await req.json().catch(() => ({}))) as { sessionId?: string };
    if (payload?.sessionId) {
      activeExplorerSessions.delete(payload.sessionId);
      pendingCommands.delete(payload.sessionId);
    }
    return { stopped: true };
  }

  throw new AccessError('Invalid file explorer admin action.', 400);
}

export async function handleFileExplorerClient(req: Request, action: string, body?: any) {
  const { session } = await authenticate(req);
  if (session.audience !== 'desktop') {
    throw new AccessError('Desktop client access required.', 403);
  }

  if (action === 'poll' && req.method === 'GET') {
    const list = pendingCommands.get(session.id) || [];
    if (list.length > 0) {
      const nextCmd = list[0];
      pendingCommands.set(session.id, list.slice(1));
      return { command: nextCmd };
    }
    return { command: null, active: activeExplorerSessions.has(session.id) };
  }

  if (action === 'respond' && req.method === 'POST') {
    const payload = (body && typeof body === 'object' ? body : await req.json().catch(() => ({}))) as FileResponse;
    if (payload?.commandId) {
      completedResponses.set(payload.commandId, payload);
      // Auto-cleanup stale responses after 60s
      setTimeout(() => completedResponses.delete(payload.commandId), 60000);
    }
    return { ok: true };
  }

  throw new AccessError('Invalid client file explorer action.', 400);
}
