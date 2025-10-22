import { marketDataTool } from '../tools/market-data';
import { riskAnalysisTool } from '../tools/risk-analysis';
import { sessionStateManager } from '../tools/session-state';

export type DcaPlanParams = {
  tokenIn: string;
  tokenOut: string;
  budget: number;
  legs: number;
  intervalMins: number;
  sessionId?: string;
  userRiskLevel?: 'conservative' | 'moderate' | 'aggressive';
};

export async function createDcaAgent() {
  // Try to load ADK at runtime. Fallback to a stub if not installed.
  const adk = await import("@iqai/adk").catch(() => null);
  if (!adk) {
    return {
      runner: {
        async ask() {
          return "ADK not installed; using stub runner.";
        },
      },
      tools: {
        marketData: marketDataTool,
        riskAnalysis: riskAnalysisTool,
        sessionState: sessionStateManager,
      },
    } as const;
  }

  const { AgentBuilder } = adk as { AgentBuilder: unknown };
  const { z } = await import("zod");

  const model = process.env.ADK_MODEL || "gemini-2.5-flash";

  // Enhanced agent instructions following ADK best practices (11.1-writing-effective-agent-instructions.md)
  const instruction = (context: any) => `
You are DCA Sitter, a specialized AI-powered financial automation agent optimizing ${context?.state?.get('strategy_type') || 'standard'} DCA strategies.

**CURRENT USER CONTEXT:**
- Total Budget: $${context?.state?.get('total_budget') || 'unknown'}
- Risk Tolerance: ${context?.state?.get('risk_level') || 'medium'}
- Target Token: ${context?.state?.get('target_token') || 'unspecified'}
- Previous DCA Plans: ${context?.state?.get('dca_history_count') || 0}
- User Experience Level: ${context?.state?.get('user_experience') || 'beginner'}

**MARKET CONTEXT:**
- Current Volatility: ${context?.state?.get('market_volatility') || 'unknown'}
- Market Trend: ${context?.state?.get('market_trend') || 'unknown'}
- Price Movement (24h): ${context?.state?.get('price_change_24h') || 'unknown'}
- Volume Analysis: ${context?.state?.get('volume_analysis') || 'unknown'}

**DECISION FRAMEWORK:**
**HIGH Volatility (>15% daily movement):**
- Increase frequency: 15-30 minute intervals
- Smaller individual amounts: 5-8% of budget per leg
- Minimum 12 legs, maximum 20 legs
- Priority: Risk mitigation over cost efficiency

**MEDIUM Volatility (5-15% daily movement):**
- Standard intervals: 45-90 minutes
- Balanced amounts: 8-15% of budget per leg
- Optimal 6-12 legs
- Priority: Balanced risk vs. cost efficiency

**LOW Volatility (<5% daily movement):**
- Longer intervals: 2-4 hours
- Larger amounts: 15-25% of budget per leg
- Minimum 4 legs, optimal 6-8 legs
- Priority: Cost efficiency and simplicity

**BUDGET ALLOCATION RULES:**
- Budget < $100: Maximum 5 legs (gas cost consideration)
- Budget $100-$1000: 6-12 legs optimal
- Budget > $1000: Up to 20 legs for maximum averaging
- Always ensure total legs amount = exactly {total_budget}

**RISK MANAGEMENT:**
- For risk_level='conservative': Favor more legs, smaller amounts
- For risk_level='aggressive': Allow fewer legs, larger amounts
- For risk_level='moderate': Balanced approach based on volatility

**TIMING OPTIMIZATION:**
- Avoid major market events if {avoid_events} = true
- Consider user timezone: {user_timezone}
- Respect trading hours for traditional assets
- Factor in network congestion patterns for crypto

**MATHEMATICAL PRECISION:**
- All amounts must sum to exactly the specified budget
- Use 6 decimal precision for amount calculations
- Ensure minimum viable trade amounts (> $10 equivalent)
- Account for potential gas fees in planning

**OUTPUT REQUIREMENTS:**
- Return valid JSON with 'plan' array and 'strategy' explanation
- Each leg: index (1-based), amount (6 decimals), atISO (valid timestamp), reasoning (optional)
- Include totalAmount for verification
- Provide strategy explanation referencing market conditions

**QUALITY ASSURANCE:**
- Verify mathematical accuracy before finalizing
- Ensure timestamps are sequential and realistic
- Check that strategy aligns with user risk tolerance
- Confirm all legs are executable given market conditions

Reference current market data and user preferences from session state for optimal DCA strategy creation.
`;

  const responseSchema = z.object({
    plan: z
      .array(
        z.object({
          index: z.number().int().positive(),
          amount: z.number().positive(),
          atISO: z.string(),
          reasoning: z.string().optional(), // Added reasoning field
        })
      )
      .default([]),
    strategy: z.string().optional(), // Overall strategy explanation
    totalAmount: z.number().optional(), // Verification total
  });

  const built = await (AgentBuilder as { create: (name: string) => { withModel: (model: string) => { withInstruction: (instruction: any) => { buildWithSchema: (schema: unknown) => Promise<{ runner: any }> } } } }).create("dca_sitter")
    .withModel(model)
    .withInstruction(instruction)
    .buildWithSchema(responseSchema);

  return {
    runner: built.runner,
    tools: {
      marketData: marketDataTool,
      riskAnalysis: riskAnalysisTool,
      sessionState: sessionStateManager,
    },
    async createOptimizedPlan(params: DcaPlanParams) {
      const { tokenIn, tokenOut, budget, sessionId, userRiskLevel = 'moderate' } = params;

      // Create or get session
      const actualSessionId = sessionId || sessionStateManager.createSession();
      const context = sessionStateManager.createAgentContext(actualSessionId);

      try {
        // Get market data and analysis
        const marketData = await marketDataTool.getMarketData(tokenOut);
        const volatilityMetrics = await marketDataTool.getVolatilityMetrics(tokenOut);
        const marketTrend = await marketDataTool.getMarketTrend(tokenOut);
        const riskAssessment = await riskAnalysisTool.assessMarketRisk(marketData, volatilityMetrics, userRiskLevel);

        // Update session state with market context
        sessionStateManager.updateState(actualSessionId, {
          total_budget: budget,
          risk_level: userRiskLevel,
          target_token: tokenOut,
          market_volatility: volatilityMetrics.category,
          market_trend: marketTrend.direction,
          price_change_24h: `${marketData.changePercent24h.toFixed(2)}%`,
          volume_analysis: `${(marketData.volume / 1000000).toFixed(1)}M`,
          risk_score: riskAssessment.riskScore,
          strategy_type: 'AI-optimized',
        });

        // Get optimal intervals and leg sizing
        const optimalParams = await marketDataTool.getOptimalIntervals(tokenOut, budget, userRiskLevel);
        const positionSizing = riskAnalysisTool.calculatePositionSizing(budget, riskAssessment, userRiskLevel, optimalParams.recommendedLegs);

        // Create the plan using the agent with full context
        const query = `Create an optimized DCA plan for ${tokenOut} with $${budget} budget, ${optimalParams.recommendedLegs} legs, ${optimalParams.recommendedIntervalMins}min intervals. Current market: ${volatilityMetrics.category} volatility, ${marketTrend.direction} trend, ${marketData.changePercent24h.toFixed(1)}% 24h change. Risk assessment: ${riskAssessment.overallRisk} (${(riskAssessment.riskScore * 100).toFixed(1)}%).`;

        const result = await built.runner.ask(query, context);

        // Validate the plan
        const validation = riskAnalysisTool.validateDcaPlan(result.plan, budget, riskAssessment, userRiskLevel);

        return {
          ...result,
          sessionId: actualSessionId,
          marketData,
          riskAssessment,
          optimalParams,
          positionSizing,
          validation,
          recommendations: riskAssessment.recommendations,
          warnings: riskAssessment.warnings,
        };
      } catch (error) {
        console.error('[DCA Agent] Plan creation failed:', error);
        throw error;
      }
    }
  } as {
    runner: any;
    tools: {
      marketData: typeof marketDataTool;
      riskAnalysis: typeof riskAnalysisTool;
      sessionState: typeof sessionStateManager;
    };
    createOptimizedPlan: (params: DcaPlanParams) => Promise<{
      plan: Array<{ index: number; amount: number; atISO: string; reasoning?: string }>;
      strategy?: string;
      totalAmount?: number;
      sessionId: string;
      marketData: any;
      riskAssessment: any;
      optimalParams: any;
      positionSizing: any;
      validation: any;
      recommendations: string[];
      warnings: string[];
    }>;
  };
}
