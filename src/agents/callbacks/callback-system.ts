import { eventSystem, type BaseEvent } from '../events/event-system';
import { sessionStateManager } from '../tools/session-state';

export type CallbackType =
  | 'agent_completion'
  | 'execution_milestone'
  | 'risk_threshold'
  | 'market_change'
  | 'user_notification'
  | 'system_alert'
  | 'webhook'
  | 'email'
  | 'push_notification';

export interface CallbackConfig {
  id: string;
  type: CallbackType;
  sessionId?: string;
  trigger: {
    eventTypes: string[];
    conditions?: Record<string, any>;
    filter?: (event: BaseEvent) => boolean;
  };
  action: {
    type: 'webhook' | 'email' | 'push' | 'function' | 'log';
    config: Record<string, any>;
    handler?: (event: BaseEvent, config: CallbackConfig) => Promise<void>;
  };
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
  };
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  createdAt: number;
  lastTriggered?: number;
  triggerCount: number;
  errorCount: number;
}

export interface CallbackExecution {
  id: string;
  callbackId: string;
  eventId: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  attempts: number;
  error?: string;
  result?: any;
}

export class CallbackSystem {
  private callbacks = new Map<string, CallbackConfig>();
  private executions = new Map<string, CallbackExecution>();
  private rateLimitTracker = new Map<string, { calls: number; resetTime: number }>();
  private readonly maxExecutionHistory = 1000;

  constructor() {
    // Subscribe to all events to check callback triggers
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
      (event) => this.handleEvent(event)
    );

    console.log('[CallbackSystem] Callback system initialized');

    // Setup default system callbacks
    this.setupDefaultCallbacks();
  }

  registerCallback(config: Omit<CallbackConfig, 'id' | 'createdAt' | 'triggerCount' | 'errorCount'>): string {
    const callbackId = this.generateCallbackId();

    const callback: CallbackConfig = {
      ...config,
      id: callbackId,
      createdAt: Date.now(),
      triggerCount: 0,
      errorCount: 0,
    };

    this.callbacks.set(callbackId, callback);

    console.log(`[CallbackSystem] Registered ${config.type} callback ${callbackId} for events: ${config.trigger.eventTypes.join(', ')}`);

    return callbackId;
  }

  unregisterCallback(callbackId: string): boolean {
    const deleted = this.callbacks.delete(callbackId);
    if (deleted) {
      console.log(`[CallbackSystem] Unregistered callback ${callbackId}`);
    }
    return deleted;
  }

  updateCallback(callbackId: string, updates: Partial<CallbackConfig>): boolean {
    const callback = this.callbacks.get(callbackId);
    if (!callback) return false;

    Object.assign(callback, updates);
    console.log(`[CallbackSystem] Updated callback ${callbackId}`);
    return true;
  }

  enableCallback(callbackId: string): boolean {
    return this.updateCallback(callbackId, { enabled: true });
  }

  disableCallback(callbackId: string): boolean {
    return this.updateCallback(callbackId, { enabled: false });
  }

  private async handleEvent(event: BaseEvent): Promise<void> {
    const matchingCallbacks = Array.from(this.callbacks.values()).filter(callback => {
      if (!callback.enabled) return false;

      // Check event type match
      if (!callback.trigger.eventTypes.includes(event.type)) return false;

      // Check session filter
      if (callback.sessionId && event.sessionId !== callback.sessionId) return false;

      // Apply custom filter
      if (callback.trigger.filter && !callback.trigger.filter(event)) return false;

      // Check conditions
      if (callback.trigger.conditions) {
        for (const [key, expectedValue] of Object.entries(callback.trigger.conditions)) {
          const actualValue = this.getNestedValue(event.data, key);
          if (actualValue !== expectedValue) return false;
        }
      }

      return true;
    });

    // Execute matching callbacks
    for (const callback of matchingCallbacks) {
      await this.executeCallback(callback, event);
    }
  }

  private async executeCallback(callback: CallbackConfig, event: BaseEvent): Promise<void> {
    // Check rate limit
    if (callback.rateLimit && this.isRateLimited(callback)) {
      console.log(`[CallbackSystem] Callback ${callback.id} rate limited`);
      return;
    }

    const executionId = this.generateExecutionId();
    const execution: CallbackExecution = {
      id: executionId,
      callbackId: callback.id,
      eventId: event.id,
      startTime: Date.now(),
      status: 'running',
      attempts: 1,
    };

    this.executions.set(executionId, execution);

    try {
      console.log(`[CallbackSystem] Executing ${callback.type} callback ${callback.id} for event ${event.type}`);

      let result: any;

      switch (callback.action.type) {
        case 'webhook':
          result = await this.executeWebhook(callback, event);
          break;

        case 'email':
          result = await this.executeEmail(callback, event);
          break;

        case 'push':
          result = await this.executePushNotification(callback, event);
          break;

        case 'function':
          if (callback.action.handler) {
            result = await callback.action.handler(event, callback);
          } else {
            throw new Error('Function handler not provided');
          }
          break;

        case 'log':
          result = await this.executeLog(callback, event);
          break;

        default:
          throw new Error(`Unknown action type: ${callback.action.type}`);
      }

      // Success
      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.result = result;

      callback.triggerCount++;
      callback.lastTriggered = Date.now();

      console.log(`[CallbackSystem] Callback ${callback.id} executed successfully in ${execution.endTime - execution.startTime}ms`);

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = error instanceof Error ? error.message : String(error);

      callback.errorCount++;

      console.error(`[CallbackSystem] Callback ${callback.id} failed:`, error);

      // Schedule retry if configured
      if (callback.retryConfig && execution.attempts < callback.retryConfig.maxRetries) {
        await this.scheduleRetry(callback, event, execution);
      } else {
        // Emit callback failure event
        await eventSystem.emit({
          type: 'agent_error',
          source: 'callback_system',
          sessionId: event.sessionId,
          data: {
            callbackId: callback.id,
            callbackType: callback.type,
            error: execution.error,
            eventId: event.id,
            attempts: execution.attempts,
          },
        });
      }
    }

    // Update rate limit tracker
    if (callback.rateLimit) {
      this.updateRateLimit(callback);
    }

    // Clean up old executions
    this.cleanupExecutions();
  }

  private async executeWebhook(callback: CallbackConfig, event: BaseEvent): Promise<any> {
    const { url, method = 'POST', headers = {}, timeout = 10000 } = callback.action.config;

    if (!url) throw new Error('Webhook URL not configured');

    const payload = {
      event,
      callback: {
        id: callback.id,
        type: callback.type,
        sessionId: callback.sessionId,
      },
      timestamp: Date.now(),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Webhook failed with status ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async executeEmail(callback: CallbackConfig, event: BaseEvent): Promise<any> {
    const { to, subject, template } = callback.action.config;

    if (!to || !subject) throw new Error('Email configuration incomplete');

    // This would integrate with an actual email service
    console.log(`[CallbackSystem] Email notification sent to ${to}: ${subject}`);

    return {
      to,
      subject,
      sentAt: Date.now(),
      provider: 'mock',
    };
  }

  private async executePushNotification(callback: CallbackConfig, event: BaseEvent): Promise<any> {
    const { userId, title, body, badge } = callback.action.config;

    if (!userId || !title) throw new Error('Push notification configuration incomplete');

    // This would integrate with a push notification service
    console.log(`[CallbackSystem] Push notification sent to ${userId}: ${title}`);

    return {
      userId,
      title,
      body,
      badge,
      sentAt: Date.now(),
      provider: 'mock',
    };
  }

  private async executeLog(callback: CallbackConfig, event: BaseEvent): Promise<any> {
    const { level = 'info', message } = callback.action.config;

    const logMessage = message || `Callback ${callback.id} triggered by ${event.type}`;

    console.log(`[CallbackSystem] ${level.toUpperCase()}: ${logMessage}`, {
      callbackId: callback.id,
      eventId: event.id,
      eventType: event.type,
      sessionId: event.sessionId,
    });

    return { logged: true, level, message: logMessage };
  }

  private isRateLimited(callback: CallbackConfig): boolean {
    if (!callback.rateLimit) return false;

    const tracker = this.rateLimitTracker.get(callback.id);
    if (!tracker) return false;

    const now = Date.now();
    if (now > tracker.resetTime) {
      // Reset window
      this.rateLimitTracker.set(callback.id, {
        calls: 0,
        resetTime: now + callback.rateLimit.windowMs,
      });
      return false;
    }

    return tracker.calls >= callback.rateLimit.maxCalls;
  }

  private updateRateLimit(callback: CallbackConfig): void {
    if (!callback.rateLimit) return;

    const now = Date.now();
    let tracker = this.rateLimitTracker.get(callback.id);

    if (!tracker || now > tracker.resetTime) {
      tracker = {
        calls: 1,
        resetTime: now + callback.rateLimit.windowMs,
      };
    } else {
      tracker.calls++;
    }

    this.rateLimitTracker.set(callback.id, tracker);
  }

  private async scheduleRetry(
    callback: CallbackConfig,
    event: BaseEvent,
    execution: CallbackExecution
  ): Promise<void> {
    if (!callback.retryConfig) return;

    const delay = callback.retryConfig.retryDelay * Math.pow(
      callback.retryConfig.backoffMultiplier,
      execution.attempts - 1
    );

    execution.status = 'retrying';

    setTimeout(async () => {
      execution.attempts++;
      execution.status = 'running';
      execution.startTime = Date.now();

      try {
        await this.executeCallback(callback, event);
      } catch (error) {
        console.error(`[CallbackSystem] Retry ${execution.attempts} failed for callback ${callback.id}:`, error);
      }
    }, delay);

    console.log(`[CallbackSystem] Scheduled retry ${execution.attempts + 1} for callback ${callback.id} in ${delay}ms`);
  }

  private cleanupExecutions(): void {
    const executions = Array.from(this.executions.values());
    if (executions.length <= this.maxExecutionHistory) return;

    // Sort by start time and keep only the most recent
    executions.sort((a, b) => b.startTime - a.startTime);
    const toDelete = executions.slice(this.maxExecutionHistory);

    for (const execution of toDelete) {
      this.executions.delete(execution.id);
    }

    console.log(`[CallbackSystem] Cleaned up ${toDelete.length} old execution records`);
  }

  private setupDefaultCallbacks(): void {
    // DCA execution completion notification
    this.registerCallback({
      type: 'execution_milestone',
      trigger: {
        eventTypes: ['dca_execution_completed'],
      },
      action: {
        type: 'log',
        config: {
          level: 'info',
          message: 'DCA execution completed successfully',
        },
      },
      enabled: true,
      priority: 'medium',
    });

    // Risk threshold warning
    this.registerCallback({
      type: 'risk_threshold',
      trigger: {
        eventTypes: ['risk_assessment_changed'],
        conditions: {
          'data.newRisk': 'high',
        },
      },
      action: {
        type: 'log',
        config: {
          level: 'warn',
          message: 'High risk conditions detected',
        },
      },
      enabled: true,
      priority: 'high',
    });

    // Agent error notification
    this.registerCallback({
      type: 'system_alert',
      trigger: {
        eventTypes: ['agent_error'],
      },
      action: {
        type: 'log',
        config: {
          level: 'error',
          message: 'Agent error occurred',
        },
      },
      enabled: true,
      priority: 'critical',
    });
  }

  // Convenience methods for common callback types
  registerDcaCompletionCallback(
    sessionId: string,
    webhookUrl: string,
    headers: Record<string, string> = {}
  ): string {
    return this.registerCallback({
      type: 'execution_milestone',
      sessionId,
      trigger: {
        eventTypes: ['dca_execution_completed'],
      },
      action: {
        type: 'webhook',
        config: {
          url: webhookUrl,
          method: 'POST',
          headers,
        },
      },
      enabled: true,
      priority: 'medium',
      retryConfig: {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2,
      },
    });
  }

  registerRiskAlertCallback(
    sessionId: string,
    riskLevel: string,
    handler: (event: BaseEvent) => Promise<void>
  ): string {
    return this.registerCallback({
      type: 'risk_threshold',
      sessionId,
      trigger: {
        eventTypes: ['risk_assessment_changed'],
        filter: (event) => event.data.newRisk === riskLevel,
      },
      action: {
        type: 'function',
        config: {},
        handler,
      },
      enabled: true,
      priority: 'high',
    });
  }

  registerMarketChangeCallback(
    tokenAddress: string,
    changeThreshold: number,
    handler: (event: BaseEvent) => Promise<void>
  ): string {
    return this.registerCallback({
      type: 'market_change',
      trigger: {
        eventTypes: ['market_data_updated'],
        filter: (event) => {
          return event.data.tokenAddress === tokenAddress &&
                 Math.abs(Number(event.data.changePercent24h) || 0) > changeThreshold;
        },
      },
      action: {
        type: 'function',
        config: {},
        handler,
      },
      enabled: true,
      priority: 'medium',
      rateLimit: {
        maxCalls: 10,
        windowMs: 60000, // 1 minute
      },
    });
  }

  // Analytics and monitoring
  getCallbackStats(): {
    totalCallbacks: number;
    enabledCallbacks: number;
    callbacksByType: Record<CallbackType, number>;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
  } {
    const callbacks = Array.from(this.callbacks.values());
    const executions = Array.from(this.executions.values());

    const callbacksByType = {} as Record<CallbackType, number>;
    callbacks.forEach(callback => {
      callbacksByType[callback.type] = (callbacksByType[callback.type] || 0) + 1;
    });

    const successfulExecutions = executions.filter(e => e.status === 'completed').length;
    const failedExecutions = executions.filter(e => e.status === 'failed').length;

    const completedExecutions = executions.filter(e => e.endTime);
    const averageExecutionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + (e.endTime! - e.startTime), 0) / completedExecutions.length
      : 0;

    return {
      totalCallbacks: callbacks.length,
      enabledCallbacks: callbacks.filter(c => c.enabled).length,
      callbacksByType,
      totalExecutions: executions.length,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
    };
  }

  getCallbacks(sessionId?: string): CallbackConfig[] {
    const callbacks = Array.from(this.callbacks.values());
    return sessionId ? callbacks.filter(c => c.sessionId === sessionId) : callbacks;
  }

  getExecutionHistory(callbackId?: string, limit = 50): CallbackExecution[] {
    const executions = Array.from(this.executions.values());
    const filtered = callbackId ? executions.filter(e => e.callbackId === callbackId) : executions;

    return filtered
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private generateCallbackId(): string {
    return `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const callbackSystem = new CallbackSystem();