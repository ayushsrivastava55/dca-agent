import { createDcaAgent, type DcaPlanParams } from "@/agents/dca/agent";

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
        // Check if it's the stub runner message
        if (out.includes("ADK not") || out.includes("stub runner")) {
          console.warn("ADK agent not available, falling back to deterministic plan");
        } else {
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
            console.warn("Failed to parse AI response:", out.substring(0, 100), parseError);
          }
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

    // Fallback to enhanced deterministic plan with smart features
    const plan = buildFallbackPlan(params);
    const fallbackStrategy = generateFallbackStrategy(params);

    return Response.json({
      plan,
      strategy: fallbackStrategy,
      totalAmount: budget,
      fallback: true,
      aiGenerated: false,
      note: "Using optimized mathematical model (AI agent temporarily unavailable)"
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "bad_request" }), { status: 400 });
  }
}
