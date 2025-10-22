import { z } from 'zod';

export type EventType =
  | 'dca_plan_created'
  | 'dca_plan_updated'
  | 'dca_execution_started'
  | 'dca_leg_executed'
  | 'dca_execution_completed'
  | 'dca_execution_failed'
  | 'market_data_updated'
  | 'risk_assessment_changed'
  | 'user_preference_updated'
  | 'session_created'
  | 'session_expired'
  | 'agent_error'
  | 'agent_warning';

export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: number;
  sessionId?: string;
  source: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EventSubscription {
  id: string;
  eventTypes: EventType[];
  handler: EventHandler;
  filter?: EventFilter;
  active: boolean;
  createdAt: number;
}

export type EventHandler = (event: BaseEvent) => Promise<void> | void;
export type EventFilter = (event: BaseEvent) => boolean;

export const BaseEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    'dca_plan_created',
    'dca_plan_updated',
    'dca_execution_started',
    'dca_leg_executed',
    'dca_execution_completed',
    'dca_execution_failed',
    'market_data_updated',
    'risk_assessment_changed',
    'user_preference_updated',
    'session_created',
    'session_expired',
    'agent_error',
    'agent_warning',
  ]),
  timestamp: z.number().int().positive(),
  sessionId: z.string().optional(),
  source: z.string(),
  data: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class EventSystem {
  private subscriptions = new Map<string, EventSubscription>();
  private eventHistory: BaseEvent[] = [];
  private readonly maxHistorySize = 1000;
  private readonly cleanupInterval = 60000; // 1 minute

  constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  subscribe(
    eventTypes: EventType[],
    handler: EventHandler,
    options: {
      filter?: EventFilter;
      sessionId?: string;
      source?: string;
    } = {}
  ): string {
    const subscriptionId = this.generateId();

    const subscription: EventSubscription = {
      id: subscriptionId,
      eventTypes,
      handler,
      filter: options.filter,
      active: true,
      createdAt: Date.now(),
    };

    this.subscriptions.set(subscriptionId, subscription);
    console.log(`[EventSystem] Created subscription ${subscriptionId} for events: ${eventTypes.join(', ')}`);

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): boolean {
    const deleted = this.subscriptions.delete(subscriptionId);
    if (deleted) {
      console.log(`[EventSystem] Removed subscription ${subscriptionId}`);
    }
    return deleted;
  }

  async emit(event: Omit<BaseEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: BaseEvent = {
      ...event,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    // Add to history
    this.eventHistory.push(fullEvent);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    console.log(`[EventSystem] Emitted event ${fullEvent.type} from ${fullEvent.source}`);

    // Find matching subscriptions
    const matchingSubscriptions = Array.from(this.subscriptions.values())
      .filter(sub =>
        sub.active &&
        sub.eventTypes.includes(fullEvent.type) &&
        (!sub.filter || sub.filter(fullEvent))
      );

    // Execute handlers
    const handlerPromises = matchingSubscriptions.map(async (subscription) => {
      try {
        await subscription.handler(fullEvent);
      } catch (error) {
        console.error(`[EventSystem] Handler error for subscription ${subscription.id}:`, error);

        // Emit error event
        this.emit({
          type: 'agent_error',
          source: 'event_system',
          data: {
            error: error instanceof Error ? error.message : String(error),
            subscriptionId: subscription.id,
            originalEvent: fullEvent,
          },
        });
      }
    });

    await Promise.allSettled(handlerPromises);
  }

  getEventHistory(
    filter?: {
      eventTypes?: EventType[];
      sessionId?: string;
      source?: string;
      since?: number;
      limit?: number;
    }
  ): BaseEvent[] {
    let filtered = this.eventHistory;

    if (filter) {
      if (filter.eventTypes) {
        filtered = filtered.filter(event => filter.eventTypes!.includes(event.type));
      }

      if (filter.sessionId) {
        filtered = filtered.filter(event => event.sessionId === filter.sessionId);
      }

      if (filter.source) {
        filtered = filtered.filter(event => event.source === filter.source);
      }

      if (filter.since) {
        filtered = filtered.filter(event => event.timestamp >= filter.since!);
      }
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    if (filter?.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  getActiveSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.active);
  }

  pauseSubscription(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.active = false;
      return true;
    }
    return false;
  }

  resumeSubscription(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.active = true;
      return true;
    }
    return false;
  }

  // Event type-specific helpers
  async emitDcaPlanCreated(
    sessionId: string,
    plan: Array<{ index: number; amount: number; atISO: string }>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.emit({
      type: 'dca_plan_created',
      sessionId,
      source: 'dca_agent',
      data: {
        plan,
        totalLegs: plan.length,
        totalAmount: plan.reduce((sum, leg) => sum + leg.amount, 0),
      },
      metadata,
    });
  }

  async emitDcaLegExecuted(
    sessionId: string,
    legIndex: number,
    amount: number,
    txHash?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.emit({
      type: 'dca_leg_executed',
      sessionId,
      source: 'dca_executor',
      data: {
        legIndex,
        amount,
        txHash,
        executedAt: Date.now(),
      },
      metadata,
    });
  }

  async emitMarketDataUpdated(
    tokenAddress: string,
    marketData: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.emit({
      type: 'market_data_updated',
      source: 'market_data_tool',
      data: {
        tokenAddress,
        ...marketData,
      },
      metadata,
    });
  }

  async emitRiskAssessmentChanged(
    sessionId: string,
    oldRisk: string,
    newRisk: string,
    riskScore: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.emit({
      type: 'risk_assessment_changed',
      sessionId,
      source: 'risk_analysis_tool',
      data: {
        oldRisk,
        newRisk,
        riskScore,
        timestamp: Date.now(),
      },
      metadata,
    });
  }

  async emitAgentWarning(
    source: string,
    warning: string,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.emit({
      type: 'agent_warning',
      sessionId,
      source,
      data: {
        warning,
        level: 'warning',
      },
      metadata,
    });
  }

  async emitAgentError(
    source: string,
    error: string | Error,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.emit({
      type: 'agent_error',
      sessionId,
      source,
      data: {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        level: 'error',
      },
      metadata,
    });
  }

  // Analytics and monitoring
  getEventStats(since?: number): {
    totalEvents: number;
    eventsByType: Record<EventType, number>;
    eventsBySource: Record<string, number>;
    activeSubscriptions: number;
    errorCount: number;
    warningCount: number;
  } {
    const sinceTime = since || 0;
    const relevantEvents = this.eventHistory.filter(event => event.timestamp >= sinceTime);

    const eventsByType = {} as Record<EventType, number>;
    const eventsBySource = {} as Record<string, number>;

    relevantEvents.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySource[event.source] = (eventsBySource[event.source] || 0) + 1;
    });

    return {
      totalEvents: relevantEvents.length,
      eventsByType,
      eventsBySource,
      activeSubscriptions: this.getActiveSubscriptions().length,
      errorCount: eventsByType.agent_error || 0,
      warningCount: eventsByType.agent_warning || 0,
    };
  }

  private cleanup(): void {
    // Remove old events
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    this.eventHistory = this.eventHistory.filter(event => event.timestamp > cutoff);

    // Remove inactive subscriptions older than 1 hour
    const subscriptionCutoff = Date.now() - (60 * 60 * 1000);
    for (const [id, subscription] of this.subscriptions.entries()) {
      if (!subscription.active && subscription.createdAt < subscriptionCutoff) {
        this.subscriptions.delete(id);
      }
    }
  }

  private generateId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Session-specific event management
  getSessionEvents(sessionId: string, eventTypes?: EventType[]): BaseEvent[] {
    return this.getEventHistory({
      sessionId,
      eventTypes,
    });
  }

  clearSessionEvents(sessionId: string): number {
    const beforeCount = this.eventHistory.length;
    this.eventHistory = this.eventHistory.filter(event => event.sessionId !== sessionId);
    return beforeCount - this.eventHistory.length;
  }
}

export const eventSystem = new EventSystem();