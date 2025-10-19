export type DcaPlanParams = {
  tokenIn: string;
  tokenOut: string;
  budget: number;
  legs: number;
  intervalMins: number;
};

export async function createDcaAgent() {
  // Try to load ADK at runtime. Fallback to a stub if not installed.
  const adk = await import("@iqai/adk").catch(() => null as any);
  if (!adk) {
    return {
      runner: {
        async ask(_: string) {
          return "ADK not installed; using stub runner.";
        },
      },
    } as const;
  }

  const { AgentBuilder } = adk as any;
  const { z } = await import("zod");

  const model = process.env.ADK_MODEL || "gemini-2.5-flash";
  const instruction = [
    "You are DCA Sitter, an AI assistant that plans DCA executions.",
    "Given token pair, total budget, number of legs, and interval, produce a JSON plan.",
    "Try to accelerate during high volatility, otherwise output evenly spaced schedule.",
  ].join(" ");

  const responseSchema = z.object({
    plan: z
      .array(
        z.object({
          index: z.number().int().positive(),
          amount: z.number(),
          atISO: z.string(),
        })
      )
      .default([]),
  });

  const built = await AgentBuilder.create("dca_sitter")
    .withModel(model)
    .withInstruction(instruction)
    .buildWithSchema(responseSchema);

  return built as { runner: { ask: (q: string) => Promise<{ plan: { index: number; amount: number; atISO: string }[] }> } };
}
