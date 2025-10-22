/**
 * Event system for DCA Sitter Agent
 * Following ADK event patterns for monitoring and logging
 */

export type DcaEventType =
  | 'delegation_created'
  | 'delegation_validated'
  | 'execution_scheduled'
  | 'leg_started'
  | 'leg_completed'
  | 'leg_failed'
  | 'execution_completed'
  | 'execution_failed'
  | 'execution_paused'
  | 'execution_resumed'
  | 'agent_error';

export type DcaEvent = {
  id: string;
  type: DcaEventType;
  timestamp: number;
  delegationId?: string;
  executionId?: string;
  legIndex?: number;
  data?: unknown;
  error?: string;
  txHash?: string;
};

export class DcaEventEmitter {
  private events: DcaEvent[] = [];
  private listeners: Map<DcaEventType, ((event: DcaEvent) => void)[]> = new Map();

  /**
   * Emit an event
   */
  emit(type: DcaEventType, data?: Record<string, unknown>): DcaEvent {
    const event: DcaEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      ...(data || {}),
    };

    // Store event
    this.events.push(event);

    // Notify listeners
    const typeListeners = this.listeners.get(type) || [];
    typeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error(`Event listener error for ${type}:`, error);
      }
    });

    console.log(`[DCA Event] ${type}:`, event);
    return event;
  }

  /**
   * Subscribe to events
   */
  on(type: DcaEventType, listener: (event: DcaEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  /**
   * Get events by type
   */
  getEvents(type?: DcaEventType): DcaEvent[] {
    if (type) {
      return this.events.filter(e => e.type === type);
    }
    return [...this.events];
  }

  /**
   * Get events for a specific delegation
   */
  getDelegationEvents(delegationId: string): DcaEvent[] {
    return this.events.filter(e => e.delegationId === delegationId);
  }

  /**
   * Get events for a specific execution
   */
  getExecutionEvents(executionId: string): DcaEvent[] {
    return this.events.filter(e => e.executionId === executionId);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 10): DcaEvent[] {
    return this.events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Clear old events (keep last N)
   */
  cleanup(keepLast: number = 1000): void {
    if (this.events.length > keepLast) {
      this.events = this.events
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, keepLast);
    }
  }

  /**
   * Get event statistics
   */
  getStats(): {
    total: number;
    byType: Record<DcaEventType, number>;
    recentErrors: DcaEvent[];
  } {
    const byType = {} as Record<DcaEventType, number>;

    // Initialize all types to 0
    const allTypes: DcaEventType[] = [
      'delegation_created', 'delegation_validated', 'execution_scheduled',
      'leg_started', 'leg_completed', 'leg_failed', 'execution_completed',
      'execution_failed', 'execution_paused', 'execution_resumed', 'agent_error'
    ];

    allTypes.forEach(type => {
      byType[type] = 0;
    });

    // Count events by type
    this.events.forEach(event => {
      byType[event.type] = (byType[event.type] || 0) + 1;
    });

    // Get recent errors
    const recentErrors = this.events
      .filter(e => e.type.includes('failed') || e.type === 'agent_error')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    return {
      total: this.events.length,
      byType,
      recentErrors,
    };
  }
}

// Singleton event emitter
let eventEmitter: DcaEventEmitter | null = null;

export function getDcaEventEmitter(): DcaEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new DcaEventEmitter();
  }
  return eventEmitter;
}

// Helper functions for common events
export function emitDelegationCreated(delegationId: string, data?: unknown): DcaEvent {
  return getDcaEventEmitter().emit('delegation_created', { delegationId, data });
}

export function emitExecutionScheduled(executionId: string, delegationId: string, data?: unknown): DcaEvent {
  return getDcaEventEmitter().emit('execution_scheduled', { executionId, delegationId, data });
}

export function emitLegStarted(executionId: string, delegationId: string, legIndex: number): DcaEvent {
  return getDcaEventEmitter().emit('leg_started', { executionId, delegationId, legIndex });
}

export function emitLegCompleted(executionId: string, delegationId: string, legIndex: number, txHash: string): DcaEvent {
  return getDcaEventEmitter().emit('leg_completed', { executionId, delegationId, legIndex, txHash });
}

export function emitLegFailed(executionId: string, delegationId: string, legIndex: number, error: string): DcaEvent {
  return getDcaEventEmitter().emit('leg_failed', { executionId, delegationId, legIndex, error });
}

export function emitExecutionCompleted(executionId: string, delegationId: string): DcaEvent {
  return getDcaEventEmitter().emit('execution_completed', { executionId, delegationId });
}

export function emitAgentError(error: string, data?: unknown): DcaEvent {
  return getDcaEventEmitter().emit('agent_error', { error, data });
}