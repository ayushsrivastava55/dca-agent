import { z } from 'zod';

export interface SessionState {
  userId?: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  data: Map<string, unknown>;
}

export interface StateSnapshot {
  sessionId: string;
  timestamp: number;
  state: Record<string, unknown>;
}

export const SessionStateSchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  data: z.record(z.string(), z.unknown()),
});

export class SessionStateManager {
  private sessions = new Map<string, SessionState>();
  private snapshots = new Map<string, StateSnapshot[]>();
  private readonly maxSnapshots = 50;
  private readonly sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours

  createSession(userId?: string): string {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const session: SessionState = {
      userId,
      sessionId,
      createdAt: now,
      updatedAt: now,
      data: new Map(),
    };

    this.sessions.set(sessionId, session);
    this.snapshots.set(sessionId, []);

    console.log(`[SessionState] Created session ${sessionId} for user ${userId || 'anonymous'}`);
    return sessionId;
  }

  getSession(sessionId: string): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check if session has expired
    if (Date.now() - session.updatedAt > this.sessionTimeout) {
      this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  setState(sessionId: string, key: string, value: unknown): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    // Create snapshot before modifying state
    this.createSnapshot(sessionId);

    session.data.set(key, value);
    session.updatedAt = Date.now();

    console.log(`[SessionState] Set ${key} for session ${sessionId}`);
    return true;
  }

  getState<T = unknown>(sessionId: string, key: string, defaultValue?: T): T | undefined {
    const session = this.getSession(sessionId);
    if (!session) return defaultValue;

    return (session.data.get(key) as T) ?? defaultValue;
  }

  getAllState(sessionId: string): Record<string, unknown> {
    const session = this.getSession(sessionId);
    if (!session) return {};

    return Object.fromEntries(session.data.entries());
  }

  deleteState(sessionId: string, key: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    this.createSnapshot(sessionId);
    const deleted = session.data.delete(key);
    if (deleted) {
      session.updatedAt = Date.now();
      console.log(`[SessionState] Deleted ${key} from session ${sessionId}`);
    }

    return deleted;
  }

  updateState(sessionId: string, updates: Record<string, unknown>): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    this.createSnapshot(sessionId);

    Object.entries(updates).forEach(([key, value]) => {
      session.data.set(key, value);
    });

    session.updatedAt = Date.now();
    console.log(`[SessionState] Updated ${Object.keys(updates).length} keys for session ${sessionId}`);
    return true;
  }

  mergeState(sessionId: string, key: string, partialValue: Record<string, unknown>): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    const currentValue = session.data.get(key);
    let mergedValue: unknown;

    if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      mergedValue = { ...currentValue as Record<string, unknown>, ...partialValue };
    } else {
      mergedValue = partialValue;
    }

    return this.setState(sessionId, key, mergedValue);
  }

  private createSnapshot(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (!session) return;

    const snapshots = this.snapshots.get(sessionId) || [];
    const snapshot: StateSnapshot = {
      sessionId,
      timestamp: Date.now(),
      state: Object.fromEntries(session.data.entries()),
    };

    snapshots.push(snapshot);

    // Keep only the last N snapshots
    if (snapshots.length > this.maxSnapshots) {
      snapshots.splice(0, snapshots.length - this.maxSnapshots);
    }

    this.snapshots.set(sessionId, snapshots);
  }

  getSnapshots(sessionId: string): StateSnapshot[] {
    return this.snapshots.get(sessionId) || [];
  }

  revertToSnapshot(sessionId: string, timestamp: number): boolean {
    const session = this.getSession(sessionId);
    const snapshots = this.snapshots.get(sessionId);

    if (!session || !snapshots) return false;

    const snapshot = snapshots.find(s => s.timestamp === timestamp);
    if (!snapshot) return false;

    // Clear current state and restore from snapshot
    session.data.clear();
    Object.entries(snapshot.state).forEach(([key, value]) => {
      session.data.set(key, value);
    });

    session.updatedAt = Date.now();
    console.log(`[SessionState] Reverted session ${sessionId} to snapshot from ${new Date(timestamp).toISOString()}`);
    return true;
  }

  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    this.snapshots.delete(sessionId);

    if (deleted) {
      console.log(`[SessionState] Deleted session ${sessionId}`);
    }

    return deleted;
  }

  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.sessionTimeout) {
        this.deleteSession(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[SessionState] Cleaned up ${cleanedCount} expired sessions`);
    }

    return cleanedCount;
  }

  getActiveSessions(): Array<{ sessionId: string; userId?: string; createdAt: number; updatedAt: number }> {
    return Array.from(this.sessions.values()).map(session => ({
      sessionId: session.sessionId,
      userId: session.userId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
  }

  exportSession(sessionId: string): string | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const exportData = {
      ...session,
      data: Object.fromEntries(session.data.entries()),
    };

    return JSON.stringify(exportData, null, 2);
  }

  importSession(sessionData: string): string | null {
    try {
      const parsed = JSON.parse(sessionData);
      const validated = SessionStateSchema.parse({
        ...parsed,
        data: parsed.data || {},
      });

      const session: SessionState = {
        ...validated,
        data: new Map(Object.entries(validated.data)),
      };

      this.sessions.set(session.sessionId, session);
      this.snapshots.set(session.sessionId, []);

      console.log(`[SessionState] Imported session ${session.sessionId}`);
      return session.sessionId;
    } catch (error) {
      console.error('[SessionState] Failed to import session:', error);
      return null;
    }
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Context object for agent instructions
  createAgentContext(sessionId: string) {
    return {
      state: {
        get: <T = unknown>(key: string, defaultValue?: T): T | undefined => {
          return this.getState(sessionId, key, defaultValue);
        },
        set: (key: string, value: unknown): boolean => {
          return this.setState(sessionId, key, value);
        },
        merge: (key: string, partialValue: Record<string, unknown>): boolean => {
          return this.mergeState(sessionId, key, partialValue);
        },
        getAll: (): Record<string, unknown> => {
          return this.getAllState(sessionId);
        },
      },
      session: {
        id: sessionId,
        createdAt: this.getSession(sessionId)?.createdAt,
        updatedAt: this.getSession(sessionId)?.updatedAt,
      },
    };
  }
}

export const sessionStateManager = new SessionStateManager();

// Auto-cleanup every hour
setInterval(() => {
  sessionStateManager.cleanup();
}, 60 * 60 * 1000);