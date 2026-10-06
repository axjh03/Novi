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

export async function handleFileExplorerAdmin(req: Request, action: string) {
  const { account, session } = await authenticate(req);
  if (session.audience !== 'portal' || account.role !== 'ADMIN') {
    throw new AccessError('Administrator access required.', 403);
  }

  const url = new URL(req.url);

  if (action === 'command' && req.method === 'POST') {
    const body = await req.json() as { sessionId: string; action: 'list_dir' | 'read_file' | 'zip_folder'; path?: string };
    if (!body.sessionId || !body.action) {
      throw new AccessError('sessionId and action are required.', 400);
    }

    // Verify session exists and is active
    const targetSession = await prisma.accessSession.findUnique({
      where: { id: body.sessionId },
    });
    if (!targetSession || targetSession.revokedAt || targetSession.expiresAt <= new Date()) {
      throw new AccessError('Device session is inactive or offline.', 404);
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const command: FileCommand = {
      id: commandId,
      sessionId: body.sessionId,
      action: body.action,
      path: body.path || '',
      createdAt: Date.now(),
    };

    activeExplorerSessions.add(body.sessionId);
    const existing = pendingCommands.get(body.sessionId) || [];
    pendingCommands.set(body.sessionId, [...existing, command]);

    // Wait up to 10 seconds for desktop client to respond
    const timeout = Date.now() + 10000;
    while (Date.now() < timeout) {
      if (completedResponses.has(commandId)) {
        const resp = completedResponses.get(commandId)!;
        completedResponses.delete(commandId);
        if (resp.error) throw new AccessError(resp.error, 500);
        return resp;
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    throw new AccessError('Device timed out. Ensure the desktop app is running and online.', 504);
  }

  if (action === 'stop' && req.method === 'POST') {
    const body = await req.json() as { sessionId: string };
    if (body.sessionId) {
      activeExplorerSessions.delete(body.sessionId);
      pendingCommands.delete(body.sessionId);
    }
    return { stopped: true };
  }

  throw new AccessError('Invalid file explorer action.', 400);
}

export async function handleFileExplorerClient(req: Request, action: string) {
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
    const body = await req.json() as FileResponse;
    if (body.commandId) {
      completedResponses.set(body.commandId, body);
      // Auto-cleanup stale responses after 60s
      setTimeout(() => completedResponses.delete(body.commandId), 60000);
    }
    return { ok: true };
  }

  throw new AccessError('Invalid client file explorer action.', 400);
}
