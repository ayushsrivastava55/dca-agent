import { BaseAgent, Event, EventActions, InMemoryRunner, LoopAgent } from "@iqai/adk";
import { getExecutionScheduler } from "./scheduler";
import { emitAgentError } from "./events";
import { isExecutorAvailable } from "./executor";

const POLL_INTERVAL_MS = Number(process.env.DCA_LOOP_INTERVAL_MS || 30000);
const IDLE_LOG_THRESHOLD = Number(process.env.DCA_LOOP_IDLE_LOGS || 10);
let idleIterations = 0;

class SchedulerTickAgent extends BaseAgent {
  constructor() {
    super({
      name: "dca_scheduler_tick",
      description: "Processes any DCA legs that are ready to execute",
    });
  }

  async *runAsyncImpl(): AsyncGenerator<Event, void, unknown> {
    try {
      const scheduler = getExecutionScheduler();
      const { executedLegs, activeExecutions } = await scheduler.tick();

      if (executedLegs > 0) {
        idleIterations = 0;
        yield new Event({
          author: this.name,
          content: [
            {
              type: "text",
              text: `Executed ${executedLegs} leg(s) across ${activeExecutions} active plan(s)`
            },
          ],
          actions: new EventActions({ escalate: false }),
        });
      } else {
        idleIterations += 1;
        if (IDLE_LOG_THRESHOLD > 0 && idleIterations % IDLE_LOG_THRESHOLD === 0) {
          yield new Event({
            author: this.name,
            content: [
              {
                type: "text",
                text: `No legs ready for execution after ${idleIterations} checks`,
              },
            ],
            actions: new EventActions({ escalate: false }),
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitAgentError(message, { source: this.name });
      yield new Event({
        author: this.name,
        content: [
          {
            type: "text",
            text: `Scheduler tick failed: ${message}`,
          },
        ],
        actions: new EventActions({ escalate: false }),
      });
    }
  }
}

class SleepAgent extends BaseAgent {
  private readonly intervalMs: number;

  constructor(intervalMs: number) {
    super({
      name: "dca_scheduler_sleep",
      description: "Backs off between scheduler ticks",
    });
    this.intervalMs = intervalMs;
  }

  async *runAsyncImpl(): AsyncGenerator<Event, void, unknown> {
    await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
    yield new Event({
      author: this.name,
      actions: new EventActions({ escalate: false }),
    });
  }
}

const loopAgent = new LoopAgent({
  name: "dca_loop_agent",
  description: "24/7 loop that processes scheduled DCA executions",
  subAgents: [new SchedulerTickAgent(), new SleepAgent(POLL_INTERVAL_MS)],
});

let loopRunner: InstanceType<typeof InMemoryRunner> | null = null;
let loopStarted = false;

export function ensureDcaLoopAgent(): void {
  if (loopStarted) return;
  if (process.env.ENABLE_DCA_LOOP_AGENT !== "true") {
    return;
  }
  if (!isExecutorAvailable()) {
    console.warn("[DCA Loop] ENABLE_DCA_LOOP_AGENT is true but AGENT_PRIVATE_KEY is missing. Background execution disabled.");
    return;
  }

  loopStarted = true;
  try {
    loopRunner = new InMemoryRunner(loopAgent);
    void loopRunner.run().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      emitAgentError(message, { source: "dca_loop_agent" });
      console.error("[DCA Loop] Runner stopped unexpectedly:", error);
      loopStarted = false;
    });
    console.log(`[DCA Loop] Started background loop agent (interval: ${POLL_INTERVAL_MS}ms)`);
  } catch (error) {
    loopStarted = false;
    const message = error instanceof Error ? error.message : String(error);
    emitAgentError(message, { source: "dca_loop_agent" });
    console.error("[DCA Loop] Failed to start loop agent:", error);
  }
}
