import { DcaExecutor, type ExecutionRequest, type DcaPlan } from './executor';

export type ScheduledExecution = {
  id: string;
  request: ExecutionRequest;
  status: 'active' | 'paused' | 'completed' | 'failed';
  createdAt: Date;
  lastExecutedLeg?: number;
  completedLegs: number;
  totalLegs: number;
  nextLegAt?: Date;
  error?: string;
};

export class ExecutionScheduler {
  private scheduledExecutions = new Map<string, ScheduledExecution>();
  private executor: DcaExecutor;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private pollIntervalMs: number;

  constructor(executor: DcaExecutor, pollIntervalMs = Number(process.env.DCA_LOOP_INTERVAL_MS || 30000)) {
    this.executor = executor;
    this.pollIntervalMs = Number.isFinite(pollIntervalMs) && pollIntervalMs > 0 ? pollIntervalMs : 30000;
  }

  /**
   * Schedule a new DCA execution plan
   */
  async schedule(request: ExecutionRequest): Promise<string> {
    console.log(`[Scheduler] Scheduling execution for delegation ${request.delegationId}`);

    // Validate delegation first
    const isValid = await this.executor.validateDelegation(request);
    if (!isValid) {
      throw new Error('Invalid delegation');
    }

    // Create scheduled execution
    const execution: ScheduledExecution = {
      id: request.delegationId,
      request,
      status: 'active',
      createdAt: new Date(),
      completedLegs: 0,
      totalLegs: request.plan.length,
      nextLegAt: this.getNextExecutionTime(request.plan),
    };

    this.scheduledExecutions.set(execution.id, execution);

    const loopAgentEnabled = process.env.ENABLE_DCA_LOOP_AGENT === 'true';
    if (!loopAgentEnabled && !this.isRunning) {
      this.start();
    }

    console.log(`[Scheduler] Scheduled execution ${execution.id} with ${execution.totalLegs} legs`);
    return execution.id;
  }

  /**
   * Get the next execution time from the plan
   */
  private getNextExecutionTime(plan: DcaPlan[]): Date | undefined {
    const pendingLegs = plan.filter(leg => leg.status === 'pending' || !leg.status);
    if (pendingLegs.length === 0) return undefined;

    // Sort by scheduled time and return the earliest
    pendingLegs.sort((a, b) => new Date(a.atISO).getTime() - new Date(b.atISO).getTime());
    return new Date(pendingLegs[0].atISO);
  }

  /**
   * Start the execution scheduler
   */
  start(): void {
    if (this.isRunning) return;

    console.log('[Scheduler] Starting execution scheduler');
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      this.processExecutions()
        .then(({ executedLegs, activeExecutions }) => {
          if (executedLegs > 0) {
            console.log(`[Scheduler] Tick executed ${executedLegs} leg(s) across ${activeExecutions} plan(s)`);
          }
        })
        .catch(error => {
          console.error('[Scheduler] Error processing executions:', error);
        });
    }, this.pollIntervalMs);
  }

  /**
   * Stop the execution scheduler
   */
  stop(): void {
    console.log('[Scheduler] Stopping execution scheduler');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Manual tick for external loop agents
   */
  async tick(): Promise<{ executedLegs: number; activeExecutions: number }> {
    return this.processExecutions();
  }

  /**
   * Process all scheduled executions
   */
  private async processExecutions(): Promise<{ executedLegs: number; activeExecutions: number }> {
    const activeExecutions = Array.from(this.scheduledExecutions.values()).filter(exec => exec.status === 'active');

    if (activeExecutions.length === 0) {
      if (this.isRunning && this.intervalId) {
        this.stop();
      }
      return { executedLegs: 0, activeExecutions: 0 };
    }

    console.log(`[Scheduler] Processing ${activeExecutions.length} active executions`);
    let executedLegs = 0;

    for (const execution of activeExecutions) {
      try {
        executedLegs += await this.processExecution(execution);
      } catch (error) {
        console.error(`[Scheduler] Error processing execution ${execution.id}:`, error);
        execution.status = 'failed';
        execution.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return { executedLegs, activeExecutions: activeExecutions.length };
  }

  /**
   * Process a single execution
   */
  private async processExecution(execution: ScheduledExecution): Promise<number> {
    const { request } = execution;

    const readyLeg = this.executor.getNextReadyLeg(request.plan);
    if (!readyLeg) {
      const completedLegs = request.plan.filter(leg => leg.status === 'completed').length;
      if (completedLegs === request.plan.length) {
        execution.status = 'completed';
        execution.completedLegs = completedLegs;
        console.log(`[Scheduler] Execution ${execution.id} completed`);
      }
      return 0;
    }

    console.log(`[Scheduler] Executing leg ${readyLeg.index} for ${execution.id}`);
    readyLeg.status = 'executing';

    try {
      const result = await this.executor.executeLeg(request, readyLeg.index);

      if (result.success) {
        readyLeg.status = 'completed';
        readyLeg.txHash = result.txHash;

        execution.lastExecutedLeg = readyLeg.index;
        execution.completedLegs++;
        execution.nextLegAt = this.getNextExecutionTime(request.plan);

        console.log(`[Scheduler] Leg ${readyLeg.index} completed for ${execution.id}`);
        return 1;
      } else {
        readyLeg.status = 'failed';
        readyLeg.error = result.error;

        execution.status = 'failed';
        execution.error = `Leg ${readyLeg.index} failed: ${result.error}`;

        console.error(`[Scheduler] Leg ${readyLeg.index} failed for ${execution.id}: ${result.error}`);
        return 0;
      }
    } catch (error) {
      readyLeg.status = 'failed';
      readyLeg.error = error instanceof Error ? error.message : 'Unknown error';

      execution.status = 'failed';
      execution.error = `Execution error: ${readyLeg.error}`;

      console.error(`[Scheduler] Execution error for ${execution.id}:`, error);
      return 0;
    }
  }

  /**
   * Get status of a scheduled execution
   */
  getExecutionStatus(executionId: string): ScheduledExecution | null {
    return this.scheduledExecutions.get(executionId) || null;
  }

  /**
   * Get all scheduled executions
   */
  getAllExecutions(): ScheduledExecution[] {
    return Array.from(this.scheduledExecutions.values());
  }

  /**
   * Pause an execution
   */
  pauseExecution(executionId: string): boolean {
    const execution = this.scheduledExecutions.get(executionId);
    if (execution && execution.status === 'active') {
      execution.status = 'paused';
      console.log(`[Scheduler] Paused execution ${executionId}`);
      return true;
    }
    return false;
  }

  /**
   * Resume an execution
   */
  resumeExecution(executionId: string): boolean {
    const execution = this.scheduledExecutions.get(executionId);
    if (execution && execution.status === 'paused') {
      execution.status = 'active';
      console.log(`[Scheduler] Resumed execution ${executionId}`);
      return true;
    }
    return false;
  }

  /**
   * Cancel an execution
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.scheduledExecutions.get(executionId);
    if (execution) {
      execution.status = 'failed';
      execution.error = 'Cancelled by user';
      console.log(`[Scheduler] Cancelled execution ${executionId}`);
      return true;
    }
    return false;
  }
}

// Singleton instance
let schedulerInstance: ExecutionScheduler | null = null;

export function getExecutionScheduler(): ExecutionScheduler {
  if (!schedulerInstance) {
    // Dynamic import will be handled at the API level
    const { getDcaExecutor } = eval('require')('./executor');
    const executor = getDcaExecutor();
    schedulerInstance = new ExecutionScheduler(executor);
  }
  return schedulerInstance;
}