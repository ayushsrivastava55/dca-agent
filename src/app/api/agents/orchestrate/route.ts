import { multiAgentOrchestrator } from '@/agents/orchestrator/multi-agent-orchestrator';
import { eventStreamManager } from '@/agents/streaming/event-stream';
import { callbackSystem } from '@/agents/callbacks/callback-system';
import { metricsCollector } from '@/agents/evaluation/metrics';
import { resolveToken } from '@/lib/tokenlist';

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const body = await req.json();
    const {
      tokenIn,
      tokenOut,
      budget,
      userRiskLevel = 'moderate',
      sessionId,
      userId,
      preferences = {},
      enableStreaming = false,
      webhookUrl,
    } = body;

    // Validate required fields
    if (!tokenIn || !tokenOut || !budget || budget <= 0) {
      return new Response(JSON.stringify({
        error: 'invalid_parameters',
        message: 'tokenIn, tokenOut, and positive budget are required',
      }), { status: 400 });
    }

    // Accept symbols or addresses; resolve symbols to addresses when possible
    const inIsAddress = typeof tokenIn === 'string' && tokenIn.startsWith('0x');
    const outIsAddress = typeof tokenOut === 'string' && tokenOut.startsWith('0x');
    const inResolved = inIsAddress ? null : await resolveToken(tokenIn);
    const outResolved = outIsAddress ? null : await resolveToken(tokenOut);
    const tokenInFinal = inIsAddress ? tokenIn : (inResolved?.address ?? tokenIn);
    const tokenOutFinal = outIsAddress ? tokenOut : (outResolved?.address ?? tokenOut);

    console.log(`[API] Starting optimized DCA orchestration for ${tokenOutFinal} with $${budget} budget`);

    // Start metrics tracking
    const startTime = started;

    // Execute multi-agent orchestration
    const result = await multiAgentOrchestrator.orchestrateOptimizedDca({
      tokenIn: tokenInFinal,
      tokenOut: tokenOutFinal,
      budget,
      userRiskLevel: userRiskLevel as 'conservative' | 'moderate' | 'aggressive',
      sessionId,
      userId,
      preferences,
    });

    // Record performance metrics
    const executionTime = Date.now() - startTime;
    metricsCollector.recordAgentMetrics({
      agentId: 'orchestrator_api',
      agentType: 'multi_agent_orchestrator',
      sessionId: result.sessionId,
      timestamp: Date.now(),
      performance: {
        executionTime,
        errorRate: 0,
        successRate: 1,
        throughput: 1,
      },
      quality: {
        accuracy: result.qualityScore,
        precision: result.confidenceLevel,
        recall: result.validationResults.overallValid ? 1 : 0.5,
        confidence: result.confidenceLevel,
        consistency: 0.9,
      },
      userExperience: {
        responseTime: executionTime,
        usabilityScore: result.validationResults.overallValid ? 0.9 : 0.7,
        errorHandling: 0.9,
      },
      business: {
        taskCompletionRate: 1,
        goalAchievement: result.qualityScore,
        resourceEfficiency: 0.8,
        valueDelivered: result.qualityScore,
      },
      custom: {
        agentCount: result.agentExecutionOrder.length,
        validationScore: result.validationResults.overallValid ? 1 : 0,
        recommendationCount: result.recommendations.length,
        warningCount: result.warnings.length,
      },
    });

    // Setup streaming if requested
    let streamSubscriptionId: string | undefined;
    if (enableStreaming) {
      const streamResult = eventStreamManager.createSessionStream(
        result.sessionId,
        ['dca_execution_started', 'dca_leg_executed', 'dca_execution_completed', 'risk_assessment_changed']
      );
      streamSubscriptionId = streamResult.subscriptionId;
    }

    // Setup webhook callback if provided
    let callbackId: string | undefined;
    if (webhookUrl) {
      callbackId = callbackSystem.registerDcaCompletionCallback(
        result.sessionId,
        webhookUrl
      );
    }

    // Prepare response
    const response = {
      success: true,
      orchestrationId: result.orchestrationId,
      sessionId: result.sessionId,
      result: {
        plan: result.dcaPlan.result.plan,
        strategy: result.dcaPlan.result.strategy,
        totalAmount: result.dcaPlan.result.totalAmount,
        marketAnalysis: {
          volatility: result.marketAnalysis.result.volatilityAnalysis.category,
          trend: result.marketAnalysis.result.trendAnalysis.direction,
          tradingScore: result.marketAnalysis.result.tradingConditions.score,
          recommendations: result.marketAnalysis.result.dcaRecommendations,
        },
        riskAssessment: {
          overallRisk: result.riskAssessment.result.assessment.overallRisk,
          riskScore: result.riskAssessment.result.assessment.riskScore,
          positionSizing: result.riskAssessment.result.positionSizing,
          warnings: result.riskAssessment.result.assessment.warnings,
        },
        validation: result.validationResults,
        qualityMetrics: {
          qualityScore: result.qualityScore,
          confidenceLevel: result.confidenceLevel,
          processingTime: result.totalProcessingTime,
        },
      },
      recommendations: result.recommendations,
      warnings: result.warnings,
      metadata: {
        agentExecutionOrder: result.agentExecutionOrder,
        artifacts: {
          marketAnalysis: result.marketAnalysis.artifactId,
          riskAssessment: result.riskAssessment.artifactId,
        },
        streamSubscriptionId,
        callbackId,
      },
      tokens: {
        input: { requested: tokenIn, resolved: tokenInFinal },
        output: { requested: tokenOut, resolved: tokenOutFinal },
      }
    };

    console.log(`[API] Orchestration completed successfully (${executionTime}ms, quality: ${(result.qualityScore * 100).toFixed(1)}%)`);

    return Response.json(response);

  } catch (error) {
    console.error('[API] Orchestration failed:', error);

    // Record error metrics
    metricsCollector.recordAgentMetrics({
      agentId: 'orchestrator_api',
      agentType: 'multi_agent_orchestrator',
      timestamp: Date.now(),
      performance: {
        executionTime: Date.now() - started,
        errorRate: 1,
        successRate: 0,
        throughput: 0,
      },
      quality: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        confidence: 0,
        consistency: 0,
      },
      userExperience: {
        responseTime: Date.now() - started,
        usabilityScore: 0.1,
        errorHandling: 0.3,
      },
      business: {
        taskCompletionRate: 0,
        goalAchievement: 0,
        resourceEfficiency: 0,
        valueDelivered: 0,
      },
      custom: {},
    });

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'orchestration_failed',
      details: error instanceof Error ? error.stack : undefined,
    }), { status: 500 });
  }
}

// Get orchestration status
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orchestrationId = url.searchParams.get('orchestrationId');
    const sessionId = url.searchParams.get('sessionId');

    if (!orchestrationId && !sessionId) {
      return new Response(JSON.stringify({
        error: 'missing_parameters',
        message: 'Either orchestrationId or sessionId is required',
      }), { status: 400 });
    }

    // Get orchestration stats
    const orchestratorStats = multiAgentOrchestrator.getOrchestrationStats();
    const activeOrchestrations = multiAgentOrchestrator.getActiveOrchestrations();

    // Get metrics if sessionId provided
    let sessionMetrics;
    if (sessionId) {
      const timeRange = { start: Date.now() - 24 * 60 * 60 * 1000, end: Date.now() }; // Last 24 hours
      sessionMetrics = {
        marketAgent: metricsCollector.calculateAggregateMetrics('market_analysis_agent', timeRange),
        riskAgent: metricsCollector.calculateAggregateMetrics('risk_management_agent', timeRange),
        orchestrator: metricsCollector.calculateAggregateMetrics('multi_agent_orchestrator', timeRange),
      };
    }

    return Response.json({
      success: true,
      orchestratorStats,
      activeOrchestrations,
      sessionMetrics,
      alerts: metricsCollector.getActiveAlerts(),
    });

  } catch (error) {
    console.error('[API] Failed to get orchestration status:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'status_fetch_failed',
    }), { status: 500 });
  }
}