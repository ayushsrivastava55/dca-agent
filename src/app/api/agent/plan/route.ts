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
        "Create a DCA execution plan with the following parameters:",
        `- Token Pair: ${tokenIn} → ${tokenOut}`,
        `- Total Budget: ${budget} ${tokenIn}`,
        `- Number of Legs: ${legs}`,
        `- Base Interval: ${intervalMins} minutes`,
        "",
        "Analyze market conditions and create an optimized execution schedule.",
        "Return a JSON response with your plan, strategy explanation, and total verification.",
        "",
        "Current market assumption: moderate volatility (adjust timing accordingly).",
      ].join("\n");

      const { runner } = agent as { runner: { ask: (prompt: string) => Promise<unknown> } };
      const out = await runner.ask(prompt);

      if (typeof out === "string") {
        try {
          const parsed = JSON.parse(out);
          if (parsed?.plan && Array.isArray(parsed.plan)) {
            return Response.json({
              plan: parsed.plan,
              strategy: parsed.strategy,
              totalAmount: parsed.totalAmount,
              aiGenerated: true
            });
          }
        } catch (parseError) {
          console.warn("Failed to parse AI response:", parseError);
        }
      } else if (out && typeof out === "object" && Array.isArray((out as { plan?: unknown[] }).plan)) {
        return Response.json({
          plan: (out as { plan: unknown[] }).plan,
          strategy: (out as { strategy?: string }).strategy,
          totalAmount: (out as { totalAmount?: number }).totalAmount,
          aiGenerated: true
        });
      }
    } catch (agentError) {
      console.warn("ADK agent failed:", agentError);
    }

    // Fallback to deterministic even-spread plan
    const plan = buildFallbackPlan(params);
    return Response.json({ plan, fallback: true });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "bad_request" }), { status: 400 });
  }
}
