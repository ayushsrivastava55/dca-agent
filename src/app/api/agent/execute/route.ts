import { getExecutionScheduler } from "@/agents/dca/scheduler";
import { getDcaExecutor } from "@/agents/dca/executor";
import type { ExecutionRequest } from "@/agents/dca/executor";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      delegationId,
      delegator,
      delegate,
      router,
      plan,
      tokenIn,
      tokenOut
    } = body ?? {};

    // Validate required fields
    if (!delegationId || !delegator || !delegate || !router || !Array.isArray(plan) || !tokenIn || !tokenOut) {
      return new Response(JSON.stringify({
        error: "missing_required_fields",
        required: ["delegationId", "delegator", "delegate", "router", "plan", "tokenIn", "tokenOut"]
      }), { status: 400 });
    }

    // Validate addresses
    if (!delegator.startsWith('0x') || !delegate.startsWith('0x') || !router.startsWith('0x')) {
      return new Response(JSON.stringify({ error: "invalid_address_format" }), { status: 400 });
    }

    // Get executor and verify delegate matches agent
    const executor = getDcaExecutor();
    if (delegate.toLowerCase() !== executor.address.toLowerCase()) {
      return new Response(JSON.stringify({
        error: "delegate_mismatch",
        expected: executor.address,
        received: delegate
      }), { status: 400 });
    }

    // Create execution request
    const executionRequest: ExecutionRequest = {
      delegationId,
      delegator: delegator as `0x${string}`,
      delegate: delegate as `0x${string}`,
      router: router as `0x${string}`,
      plan: plan.map((leg: { index: number; amount: number; atISO: string; status?: string }) => ({
        index: leg.index,
        amount: leg.amount,
        atISO: leg.atISO,
        status: (leg.status as 'pending' | 'executing' | 'completed' | 'failed') || 'pending'
      })),
      tokenIn,
      tokenOut,
      permissionContext: [], // TODO: Add proper delegation context
    };

    // Schedule execution
    const scheduler = getExecutionScheduler();
    const executionId = await scheduler.schedule(executionRequest);

    console.log(`[API] Scheduled DCA execution ${executionId} for delegation ${delegationId}`);

    return Response.json({
      success: true,
      executionId,
      delegationId,
      agentAddress: executor.address,
      scheduledLegs: plan.length,
      message: "DCA execution scheduled successfully"
    });

  } catch (e: unknown) {
    console.error('[API] Execute error:', e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "execution_scheduling_failed"
    }), { status: 500 });
  }
}

// Get execution status
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const executionId = url.searchParams.get('executionId');

    if (!executionId) {
      return new Response(JSON.stringify({ error: "execution_id_required" }), { status: 400 });
    }

    const scheduler = getExecutionScheduler();
    const execution = scheduler.getExecutionStatus(executionId);

    if (!execution) {
      return new Response(JSON.stringify({ error: "execution_not_found" }), { status: 404 });
    }

    return Response.json({
      success: true,
      execution: {
        id: execution.id,
        status: execution.status,
        createdAt: execution.createdAt,
        completedLegs: execution.completedLegs,
        totalLegs: execution.totalLegs,
        lastExecutedLeg: execution.lastExecutedLeg,
        nextLegAt: execution.nextLegAt,
        error: execution.error,
        plan: execution.request.plan,
      }
    });

  } catch (e: unknown) {
    console.error('[API] Get execution status error:', e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "get_status_failed"
    }), { status: 500 });
  }
}
