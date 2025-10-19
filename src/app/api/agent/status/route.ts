export async function GET() {
  // TODO: report agent/queue status, last execution, health checks
  return Response.json({ ok: true, status: "ready" });
}
