import { createDcaAgent, type DcaPlanParams } from "@/agents/dca/agent";

function buildFallbackPlan({ budget, legs, intervalMins }: DcaPlanParams) {
  const amt = budget / legs;
  const now = Date.now();
  return Array.from({ length: legs }).map((_, i) => ({
    index: i + 1,
    amount: Number.isFinite(amt) ? Number(amt.toFixed(6)) : 0,
    atISO: new Date(now + i * intervalMins * 60_000).toISOString(),
    status: "pending" as const,
  }));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<DcaPlanParams>;
    const tokenIn = body.tokenIn ?? "MON";
    const tokenOut = body.tokenOut ?? "USDC";
    const budget = Number(body.budget ?? 100);
    const legs = Number(body.legs ?? 4);
    const intervalMins = Number(body.intervalMins ?? 60);

    const params: DcaPlanParams = { tokenIn, tokenOut, budget, legs, intervalMins };

    // Try ADK agent first
    try {
      const agent = await createDcaAgent();
      const prompt = [
        "Return strictly JSON with shape {\"plan\": [{\"index\": number, \"amount\": number, \"atISO\": string}]}",
        "Don't include markdown or prose.",
        `tokenIn=${tokenIn} tokenOut=${tokenOut} budget=${budget} legs=${legs} intervalMins=${intervalMins}`,
      ].join("\n");
      const { runner } = agent as any;
      const out = await runner.ask(prompt);
      if (typeof out === "string") {
        try {
          const parsed = JSON.parse(out);
          if (parsed?.plan && Array.isArray(parsed.plan)) return Response.json({ plan: parsed.plan });
        } catch {}
        // fallthrough to fallback plan
      } else if (out && typeof out === "object" && Array.isArray((out as any).plan)) {
        return Response.json({ plan: (out as any).plan });
      }
    } catch (_e) {
      // ignore, fallback below
    }

    // Fallback to deterministic even-spread plan
    const plan = buildFallbackPlan(params);
    return Response.json({ plan, fallback: true });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "bad_request" }), { status: 400 });
  }
}
