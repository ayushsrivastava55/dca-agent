import { getExecutionScheduler } from "@/agents/dca/scheduler";
import { getDcaExecutor } from "@/agents/dca/executor";

export async function GET() {
  try {
    // Get executor info
    const executor = getDcaExecutor();
    const scheduler = getExecutionScheduler();

    // Get all executions
    const allExecutions = scheduler.getAllExecutions();

    // Calculate stats
    const activeExecutions = allExecutions.filter(e => e.status === 'active').length;
    const completedExecutions = allExecutions.filter(e => e.status === 'completed').length;
    const failedExecutions = allExecutions.filter(e => e.status === 'failed').length;
    const pausedExecutions = allExecutions.filter(e => e.status === 'paused').length;

    // Get recent activity
    const recentExecutions = allExecutions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map(e => ({
        id: e.id,
        status: e.status,
        createdAt: e.createdAt,
        completedLegs: e.completedLegs,
        totalLegs: e.totalLegs,
        lastExecutedLeg: e.lastExecutedLeg,
        nextLegAt: e.nextLegAt,
        error: e.error,
      }));

    // Calculate next scheduled execution
    const activeExecs = allExecutions.filter(e => e.status === 'active');
    const nextExecution = activeExecs
      .filter(e => e.nextLegAt)
      .sort((a, b) => a.nextLegAt!.getTime() - b.nextLegAt!.getTime())[0];

    return Response.json({
      success: true,
      agent: {
        address: executor.address,
        status: "ready",
        uptime: process.uptime(),
      },
      scheduler: {
        isRunning: true, // In a real implementation, you'd check this from the scheduler
        activeExecutions,
        completedExecutions,
        failedExecutions,
        pausedExecutions,
        totalExecutions: allExecutions.length,
      },
      nextExecution: nextExecution ? {
        id: nextExecution.id,
        scheduledAt: nextExecution.nextLegAt,
        leg: (nextExecution.lastExecutedLeg || 0) + 1,
      } : null,
      recentActivity: recentExecutions,
      timestamp: new Date().toISOString(),
    });

  } catch (e: unknown) {
    console.error('[API] Status error:', e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "status_check_failed",
      timestamp: new Date().toISOString(),
    }), { status: 500 });
  }
}
