import { getExecutionScheduler } from "@/agents/dca/scheduler";

export async function POST(req: Request) {
  try {
    const { executionId } = await req.json();
    if (!executionId) return Response.json({ error: "execution_id_required" }, { status: 400 });
    const scheduler = getExecutionScheduler();
    const ok = scheduler.pauseExecution(executionId);
    if (!ok) return Response.json({ error: "unable_to_pause" }, { status: 400 });
    return Response.json({ success: true });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "pause_error" }, { status: 500 });
  }
}
