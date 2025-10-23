import { eventSystem, type BaseEvent, type EventType } from '../events/event-system';

export interface StreamSubscription {
  id: string;
  sessionId?: string;
  eventTypes: EventType[];
  filter?: (event: BaseEvent) => boolean;
  active: boolean;
  createdAt: number;
  lastEventTime?: number;
  eventCount: number;
}

export interface StreamMessage {
  type: 'event' | 'heartbeat' | 'error' | 'connection' | 'subscription';
  timestamp: number;
  data: any;
  subscriptionId?: string;
}

export class EventStreamManager {
  private streams = new Map<string, ReadableStream<Uint8Array>>();
  private streamControllers = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  private subscriptions = new Map<string, StreamSubscription>();
  private heartbeatInterval = 30000; // 30 seconds
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private closedControllers = new Set<string>();

  constructor() {
    // Subscribe to all events for streaming
    eventSystem.subscribe(
      [
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
      ],
      (event) => this.broadcastEvent(event)
    );

    console.log('[EventStream] Event stream manager initialized');
  }

  createEventStream(
    sessionId?: string,
    eventTypes?: EventType[],
    filter?: (event: BaseEvent) => boolean
  ): { stream: ReadableStream<Uint8Array>; subscriptionId: string } {
    const subscriptionId = this.generateSubscriptionId();

    console.log(`[EventStream] Creating event stream ${subscriptionId} for session ${sessionId || 'global'}`);

    const subscription: StreamSubscription = {
      id: subscriptionId,
      sessionId,
      eventTypes: eventTypes || [
        'dca_plan_created',
        'dca_execution_started',
        'dca_leg_executed',
        'dca_execution_completed',
        'market_data_updated',
        'risk_assessment_changed',
        'agent_error',
        'agent_warning',
      ],
      filter,
      active: true,
      createdAt: Date.now(),
      eventCount: 0,
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.closedControllers.delete(subscriptionId);

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.streamControllers.set(subscriptionId, controller);

        // Send initial connection message
        this.sendMessage(subscriptionId, {
          type: 'connection',
          timestamp: Date.now(),
          data: {
            subscriptionId,
            sessionId,
            eventTypes: subscription.eventTypes,
            status: 'connected',
          },
        });

        // Send subscription confirmation
        this.sendMessage(subscriptionId, {
          type: 'subscription',
          timestamp: Date.now(),
          data: {
            subscriptionId,
            message: 'Successfully subscribed to event stream',
            eventTypes: subscription.eventTypes,
          },
          subscriptionId,
        });

        // Start heartbeat
        this.startHeartbeat(subscriptionId);

        console.log(`[EventStream] Stream ${subscriptionId} connected and heartbeat started`);
      },

      cancel: () => {
        this.closeStream(subscriptionId);
      },
    });

    this.streams.set(subscriptionId, stream);

    return { stream, subscriptionId };
  }

  closeStream(subscriptionId: string): void {
    console.log(`[EventStream] Closing stream ${subscriptionId}`);

    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.active = false;
    }

    // Stop heartbeat
    const heartbeatTimer = this.heartbeatTimers.get(subscriptionId);
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      this.heartbeatTimers.delete(subscriptionId);
    }

    // Close stream controller
    const controller = this.streamControllers.get(subscriptionId);
    if (controller && !this.closedControllers.has(subscriptionId)) {
      try {
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('Invalid state')) {
          console.warn(`[EventStream] Error closing controller for ${subscriptionId}:`, error);
        }
      }
      this.closedControllers.add(subscriptionId);
      this.streamControllers.delete(subscriptionId);
    } else {
      this.streamControllers.delete(subscriptionId);
    }

    // Clean up
    this.streams.delete(subscriptionId);
    this.subscriptions.delete(subscriptionId);
    this.closedControllers.delete(subscriptionId);
  }

  updateSubscription(
    subscriptionId: string,
    updates: {
      eventTypes?: EventType[];
      filter?: (event: BaseEvent) => boolean;
      active?: boolean;
    }
  ): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    if (updates.eventTypes) {
      subscription.eventTypes = updates.eventTypes;
    }

    if (updates.filter !== undefined) {
      subscription.filter = updates.filter;
    }

    if (updates.active !== undefined) {
      subscription.active = updates.active;
    }

    // Send update notification
    this.sendMessage(subscriptionId, {
      type: 'subscription',
      timestamp: Date.now(),
      data: {
        subscriptionId,
        message: 'Subscription updated',
        eventTypes: subscription.eventTypes,
        active: subscription.active,
      },
      subscriptionId,
    });

    console.log(`[EventStream] Updated subscription ${subscriptionId}`);
    return true;
  }

  private broadcastEvent(event: BaseEvent): void {
    const activeSubscriptions = Array.from(this.subscriptions.values()).filter(sub => sub.active);

    for (const subscription of activeSubscriptions) {
      // Check if event type matches
      if (!subscription.eventTypes.includes(event.type)) {
        continue;
      }

      // Check session filter
      if (subscription.sessionId && event.sessionId && subscription.sessionId !== event.sessionId) {
        continue;
      }

      // Apply custom filter
      if (subscription.filter && !subscription.filter(event)) {
        continue;
      }

      // Send event
      this.sendMessage(subscription.id, {
        type: 'event',
        timestamp: Date.now(),
        data: event,
        subscriptionId: subscription.id,
      });

      // Update subscription stats
      subscription.lastEventTime = Date.now();
      subscription.eventCount++;
    }
  }

  private sendMessage(subscriptionId: string, message: StreamMessage): void {
    const controller = this.streamControllers.get(subscriptionId);
    if (!controller) return;

    try {
      const jsonString = JSON.stringify(message);
      const data = `data: ${jsonString}\n\n`;
      const bytes = new TextEncoder().encode(data);
      controller.enqueue(bytes);
    } catch (error) {
      console.error(`[EventStream] Error sending message to ${subscriptionId}:`, error);

      // Send error message
      try {
        const errorMessage: StreamMessage = {
          type: 'error',
          timestamp: Date.now(),
          data: {
            error: 'Failed to send message',
            originalError: error instanceof Error ? error.message : String(error),
          },
          subscriptionId,
        };

        const errorData = `data: ${JSON.stringify(errorMessage)}\n\n`;
        const errorBytes = new TextEncoder().encode(errorData);
        controller.enqueue(errorBytes);
      } catch (secondaryError) {
        console.error(`[EventStream] Failed to send error message:`, secondaryError);
      }
    }
  }

  private startHeartbeat(subscriptionId: string): void {
    const timer = setInterval(() => {
      const subscription = this.subscriptions.get(subscriptionId);
      if (!subscription || !subscription.active) {
        clearInterval(timer);
        this.heartbeatTimers.delete(subscriptionId);
        return;
      }

      this.sendMessage(subscriptionId, {
        type: 'heartbeat',
        timestamp: Date.now(),
        data: {
          subscriptionId,
          eventCount: subscription.eventCount,
          lastEventTime: subscription.lastEventTime,
          uptime: Date.now() - subscription.createdAt,
        },
      });
    }, this.heartbeatInterval);

    this.heartbeatTimers.set(subscriptionId, timer);
  }

  // Session-specific streaming
  createSessionStream(sessionId: string, eventTypes?: EventType[]): {
    stream: ReadableStream<Uint8Array>;
    subscriptionId: string;
  } {
    return this.createEventStream(
      sessionId,
      eventTypes,
      (event) => event.sessionId === sessionId
    );
  }

  // DCA execution streaming
  createExecutionStream(sessionId: string, executionId?: string): {
    stream: ReadableStream<Uint8Array>;
    subscriptionId: string;
  } {
    return this.createEventStream(
      sessionId,
      ['dca_execution_started', 'dca_leg_executed', 'dca_execution_completed', 'dca_execution_failed'],
      (event) => {
        if (event.sessionId !== sessionId) return false;
        if (executionId && event.data.executionId !== executionId) return false;
        return true;
      }
    );
  }

  // Market data streaming
  createMarketStream(tokenAddress?: string): {
    stream: ReadableStream<Uint8Array>;
    subscriptionId: string;
  } {
    return this.createEventStream(
      undefined,
      ['market_data_updated', 'risk_assessment_changed'],
      (event) => {
        if (tokenAddress && event.data.tokenAddress !== tokenAddress) return false;
        return true;
      }
    );
  }

  // Error and warning streaming
  createMonitoringStream(sessionId?: string): {
    stream: ReadableStream<Uint8Array>;
    subscriptionId: string;
  } {
    return this.createEventStream(
      sessionId,
      ['agent_error', 'agent_warning'],
      (event) => {
        if (sessionId && event.sessionId !== sessionId) return false;
        return true;
      }
    );
  }

  // Analytics and monitoring
  getStreamStats(): {
    activeStreams: number;
    totalEvents: number;
    streamsPerSession: Record<string, number>;
    eventTypeDistribution: Record<EventType, number>;
    averageEventsPerStream: number;
  } {
    const activeStreams = Array.from(this.subscriptions.values()).filter(sub => sub.active);
    const totalEvents = activeStreams.reduce((sum, sub) => sum + sub.eventCount, 0);

    const streamsPerSession: Record<string, number> = {};
    const eventTypeDistribution: Record<EventType, number> = {} as Record<EventType, number>;

    activeStreams.forEach(sub => {
      if (sub.sessionId) {
        streamsPerSession[sub.sessionId] = (streamsPerSession[sub.sessionId] || 0) + 1;
      }

      sub.eventTypes.forEach(eventType => {
        eventTypeDistribution[eventType] = (eventTypeDistribution[eventType] || 0) + 1;
      });
    });

    return {
      activeStreams: activeStreams.length,
      totalEvents,
      streamsPerSession,
      eventTypeDistribution,
      averageEventsPerStream: activeStreams.length > 0 ? totalEvents / activeStreams.length : 0,
    };
  }

  getActiveSubscriptions(): Array<{
    id: string;
    sessionId?: string;
    eventTypes: EventType[];
    active: boolean;
    createdAt: number;
    eventCount: number;
    lastEventTime?: number;
  }> {
    return Array.from(this.subscriptions.values()).map(sub => ({
      id: sub.id,
      sessionId: sub.sessionId,
      eventTypes: sub.eventTypes,
      active: sub.active,
      createdAt: sub.createdAt,
      eventCount: sub.eventCount,
      lastEventTime: sub.lastEventTime,
    }));
  }

  // Cleanup inactive streams
  cleanup(): number {
    const now = Date.now();
    const maxInactiveTime = 5 * 60 * 1000; // 5 minutes
    let cleanedCount = 0;

    for (const [id, subscription] of this.subscriptions.entries()) {
      if (!subscription.active ||
          (subscription.lastEventTime && now - subscription.lastEventTime > maxInactiveTime)) {
        this.closeStream(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[EventStream] Cleaned up ${cleanedCount} inactive streams`);
    }

    return cleanedCount;
  }

  private generateSubscriptionId(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const eventStreamManager = new EventStreamManager();

// Auto-cleanup every 5 minutes
setInterval(() => {
  eventStreamManager.cleanup();
}, 5 * 60 * 1000);
