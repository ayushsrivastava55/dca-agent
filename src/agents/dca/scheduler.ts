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

  constructor(executor: DcaExecutor) {
    this.executor = executor;
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

    // Start scheduler if not running
    if (!this.isRunning) {
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

    // Check for ready executions every 30 seconds
    this.intervalId = setInterval(() => {
      this.processExecutions().catch(error => {
        console.error('[Scheduler] Error processing executions:', error);
      });
    }, 30000);
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
   * Process all scheduled executions
   */
  private async processExecutions(): Promise<void> {
    const activeExecutions = Array.from(this.scheduledExecutions.values())
      .filter(exec => exec.status === 'active');

    if (activeExecutions.length === 0) {
      console.log('[Scheduler] No active executions to process');
      return;
    }

    console.log(`[Scheduler] Processing ${activeExecutions.length} active executions`);

    for (const execution of activeExecutions) {
      try {
        await this.processExecution(execution);
      } catch (error) {
        console.error(`[Scheduler] Error processing execution ${execution.id}:`, error);
        // Mark execution as failed
        execution.status = 'failed';
        execution.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }
  }

  /**
   * Process a single execution
   */
  private async processExecution(execution: ScheduledExecution): Promise<void> {
    const { request } = execution;

    // Find next ready leg
    const readyLeg = this.executor.getNextReadyLeg(request.plan);
    if (!readyLeg) {
      // Check if all legs are completed
      const completedLegs = request.plan.filter(leg => leg.status === 'completed').length;
      if (completedLegs === request.plan.length) {
        execution.status = 'completed';
        execution.completedLegs = completedLegs;
        console.log(`[Scheduler] Execution ${execution.id} completed`);
      }
      return;
    }

    console.log(`[Scheduler] Executing leg ${readyLeg.index} for ${execution.id}`);

    // Mark leg as executing
    readyLeg.status = 'executing';

    try {
      // Execute the leg
      const result = await this.executor.executeLeg(request, readyLeg.index);

      if (result.success) {
        // Mark leg as completed
        readyLeg.status = 'completed';
        readyLeg.txHash = result.txHash;

        execution.lastExecutedLeg = readyLeg.index;
        execution.completedLegs++;
        execution.nextLegAt = this.getNextExecutionTime(request.plan);

        console.log(`[Scheduler] Leg ${readyLeg.index} completed for ${execution.id}`);
      } else {
        // Mark leg as failed
        readyLeg.status = 'failed';
        readyLeg.error = result.error;

        // For now, pause the entire execution on any failure
        // In production, you might want more sophisticated retry logic
        execution.status = 'failed';
        execution.error = `Leg ${readyLeg.index} failed: ${result.error}`;

        console.error(`[Scheduler] Leg ${readyLeg.index} failed for ${execution.id}: ${result.error}`);
      }
    } catch (error) {
      // Mark leg as failed
      readyLeg.status = 'failed';
      readyLeg.error = error instanceof Error ? error.message : 'Unknown error';

      execution.status = 'failed';
      execution.error = `Execution error: ${readyLeg.error}`;

      console.error(`[Scheduler] Execution error for ${execution.id}:`, error);
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