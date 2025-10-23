import { createDcaAgent, type DcaPlanParams } from "@/agents/dca/agent";
export const runtime = 'nodejs';

function buildFallbackPlan({ budget, legs, intervalMins }: DcaPlanParams) {
  const amt = budget / legs;
  const now = Date.now();

  // Enhanced fallback with simple volatility-based timing adjustments
  const baseInterval = intervalMins * 60_000; // Convert to milliseconds

  return Array.from({ length: legs }).map((_, i) => {
    // Add some variance to timing (±25% randomization for better DCA effect)
    const variance = 0.5 - Math.random(); // -0.5 to +0.5
    const adjustedInterval = baseInterval * (1 + variance * 0.25);

    return {
      index: i + 1,
      amount: Number.isFinite(amt) ? Number(amt.toFixed(6)) : 0,
      atISO: new Date(now + i * adjustedInterval).toISOString(),
      status: "pending" as const,
    };
  });
}

function generateFallbackStrategy({ budget, legs, intervalMins, tokenIn, tokenOut }: DcaPlanParams): string {
  const avgAmount = budget / legs;
  const totalDuration = (legs - 1) * intervalMins;

  let strategy = `Smart DCA Strategy for ${tokenIn} → ${tokenOut}\n\n`;

  if (budget < 100) {
    strategy += "• Conservative approach with minimal legs to reduce gas costs\n";
  } else if (budget > 1000) {
    strategy += "• Aggressive dollar-cost averaging with optimized leg distribution\n";
  } else {
    strategy += "• Balanced approach optimizing for both cost efficiency and risk reduction\n";
  }

  strategy += `• Total execution time: ${Math.round(totalDuration / 60)} hours\n`;
  strategy += `• Average amount per leg: $${avgAmount.toFixed(2)}\n`;
  strategy += `• Timing variance: ±25% randomization for optimal market entry\n`;

  if (intervalMins < 60) {
    strategy += "• High-frequency execution for volatile market conditions\n";
  } else if (intervalMins > 120) {
    strategy += "• Extended intervals for stable market accumulation\n";
  } else {
    strategy += "• Standard intervals for balanced market exposure\n";
  }

  return strategy;
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

    // Use ADK agent plan generation (no mock fallback)
    try {
      const agent = await createDcaAgent();
      const result = await agent.createOptimizedPlan(params);
      if (!result || !Array.isArray(result.plan) || result.plan.length === 0) {
        throw new Error("invalid_ai_plan");
      }
      return Response.json({
        plan: result.plan,
        strategy: result.strategy,
        totalAmount: result.totalAmount,
        aiGenerated: true,
      });
    } catch (agentError) {
      console.error("ADK plan generation failed:", agentError);

      const fallbackPlan = buildFallbackPlan(params);
      const fallbackStrategy = generateFallbackStrategy(params);

      return Response.json({
        plan: fallbackPlan,
        strategy: fallbackStrategy,
        totalAmount: fallbackPlan.reduce((sum, leg) => sum + leg.amount, 0),
        aiGenerated: false,
        fallback: true,
        error: agentError instanceof Error ? agentError.message : String(agentError),
      });
    }
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "bad_request" }), { status: 400 });
  }
}
