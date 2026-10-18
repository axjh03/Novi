export interface DebugOperation {
  id: string;
  operation: string;
  startedAt: number;
  lastActivityAt: number;
  stage: string;
  conversationId?: string;
  connectionId?: string;
  model?: string;
  engine?: string;
  taskId?: string;
}

export interface DebugEvent extends DebugOperation {
  sequence: number;
  time: number;
  level: 'info' | 'warning' | 'error';
  details: Record<string, string | number | boolean>;
}

export interface DebugState {
  enabled: boolean;
  active: DebugOperation[];
  events: DebugEvent[];
}
