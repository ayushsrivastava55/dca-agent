export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { plan, index, delegate, router } = body ?? {};
    // TODO: integrate DTK execution and scheduling
    if (!Array.isArray(plan) || typeof index !== "number") {
      return new Response(JSON.stringify({ error: "invalid_payload" }), { status: 400 });
    }
    return Response.json({ ok: true, scheduled: true, index, delegate, router });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "execute_error" }), { status: 400 });
  }
}
