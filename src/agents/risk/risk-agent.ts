import { riskAnalysisTool } from '../tools/risk-analysis';
import { eventSystem } from '../events/event-system';
import { artifactsManager } from '../artifacts/artifacts-manager';
import { sessionStateManager } from '../tools/session-state';
import { agentConfig } from '../config/agent-config';

export interface RiskAssessmentRequest {
  sessionId: string;
  tokenAddress: string;
  userRiskLevel: 'conservative' | 'moderate' | 'aggressive';
  budget: number;
  proposedPlan?: Array<{ index: number; amount: number; atISO: string }>;
  marketData?: any;
  volatilityMetrics?: any;
}

export interface RiskAssessmentResult {
  sessionId: string;
  tokenAddress: string;
  userRiskLevel: 'conservative' | 'moderate' | 'aggressive';
  timestamp: number;
  assessment: {
    overallRisk: 'low' | 'medium' | 'high' | 'extreme';
    riskScore: number;
    factors: {
      volatilityRisk: number;
      liquidityRisk: number;
      timingRisk: number;
      concentrationRisk: number;
    };
    recommendations: string[];
    warnings: string[];
  };
  positionSizing: {
    maxPositionSize: number;
    recommendedLegSize: number;
    safetyMargin: number;
    reasoning: string;
  };
  planValidation?: {
    isValid: boolean;
    issues: string[];
    adjustments: string[];
  };
  riskMitigationStrategies: string[];
  monitoringRecommendations: string[];
  emergencyProtocols: string[];
  artifactId: string;
}

export class RiskManagementAgent {
  private assessmentCache = new Map<string, { result: RiskAssessmentResult; timestamp: number }>();
  private readonly cacheTimeout = 180000; // 3 minutes
  private riskThresholds = agentConfig.riskManagement.thresholds;

  constructor() {
    // Subscribe to market data changes for risk reassessment
    eventSystem.subscribe(['market_data_updated', 'dca_plan_created'], async (event) => {
      if (event.sessionId && event.data.tokenAddress) {
        await this.handleRiskTrigger(event.sessionId, event.data.tokenAddress as string, event.type);
      }
    });
  }

  async assessRisk(request: RiskAssessmentRequest): Promise<RiskAssessmentResult> {
    const { sessionId, tokenAddress, userRiskLevel, budget, proposedPlan, marketData, volatilityMetrics } = request;

    console.log(`[RiskAgent] Assessing ${userRiskLevel} risk for ${tokenAddress} in session ${sessionId}`);

    try {
      // Check cache first
      const cacheKey = `${sessionId}_${tokenAddress}_${userRiskLevel}_${budget}`;
      const cached = this.assessmentCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout && !proposedPlan) {
        console.log(`[RiskAgent] Returning cached assessment for ${tokenAddress}`);
        return cached.result;
      }

      // Get or use provided market data
      let actualMarketData = marketData;
      let actualVolatilityMetrics = volatilityMetrics;

      if (!actualMarketData || !actualVolatilityMetrics) {
        const { marketDataTool } = await import('../tools/market-data');
        actualMarketData = actualMarketData || await marketDataTool.getMarketData(tokenAddress);
        actualVolatilityMetrics = actualVolatilityMetrics || await marketDataTool.getVolatilityMetrics(tokenAddress);
      }

      // Perform risk assessment
      const assessment = await riskAnalysisTool.assessMarketRisk(
        actualMarketData,
        actualVolatilityMetrics,
        userRiskLevel
      );

      // Calculate position sizing
      const positionSizing = riskAnalysisTool.calculatePositionSizing(
        budget,
        assessment,
        userRiskLevel,
        proposedPlan?.length || 8
      );

      // Validate proposed plan if provided
      let planValidation: RiskAssessmentResult['planValidation'];
      if (proposedPlan) {
        planValidation = riskAnalysisTool.validateDcaPlan(
          proposedPlan,
          budget,
          assessment,
          userRiskLevel
        );
      }

      // Generate risk mitigation strategies
      const riskMitigationStrategies = this.generateRiskMitigationStrategies(
        assessment,
        userRiskLevel,
        actualMarketData,
        actualVolatilityMetrics
      );

      // Generate monitoring recommendations
      const monitoringRecommendations = this.generateMonitoringRecommendations(
        assessment,
        actualVolatilityMetrics,
        userRiskLevel
      );

      // Generate emergency protocols
      const emergencyProtocols = this.generateEmergencyProtocols(
        assessment,
        userRiskLevel,
        budget
      );

      // Create result
      const result: RiskAssessmentResult = {
        sessionId,
        tokenAddress,
        userRiskLevel,
        timestamp: Date.now(),
        assessment,
        positionSizing,
        planValidation,
        riskMitigationStrategies,
        monitoringRecommendations,
        emergencyProtocols,
        artifactId: '', // Will be set after artifact creation
      };

      // Store as artifact
      const artifactId = await artifactsManager.createRiskAssessment(
        sessionId,
        {
          overallRisk: assessment.overallRisk,
          riskScore: assessment.riskScore,
          factors: assessment.factors,
          recommendations: assessment.recommendations,
          warnings: assessment.warnings,
        },
        tokenAddress
      );

      result.artifactId = artifactId;

      // Update session state
      sessionStateManager.updateState(sessionId, {
        [`risk_assessment_${tokenAddress}`]: {
          lastUpdate: result.timestamp,
          riskLevel: assessment.overallRisk,
          riskScore: assessment.riskScore,
          userRiskLevel,
          artifactId,
        },
        risk_score: assessment.riskScore,
        risk_level: userRiskLevel,
      });

      // Check for risk threshold violations
      await this.checkRiskThresholds(result);

      // Cache result
      this.assessmentCache.set(cacheKey, { result, timestamp: Date.now() });

      // Emit completion event
      await eventSystem.emitRiskAssessmentChanged(
        sessionId,
        'unknown',
        assessment.overallRisk,
        assessment.riskScore,
        { artifactId, tokenAddress }
      );

      console.log(`[RiskAgent] Completed risk assessment for ${tokenAddress}: ${assessment.overallRisk} risk (${(assessment.riskScore * 100).toFixed(1)}%)`);
      return result;

    } catch (error) {
      console.error(`[RiskAgent] Risk assessment failed for ${tokenAddress}:`, error);

      await eventSystem.emitAgentError(
        'risk_management_agent',
        error instanceof Error ? error : String(error),
        sessionId,
        { tokenAddress, userRiskLevel }
      );

      throw error;
    }
  }

  async monitorOngoingRisk(
    sessionId: string,
    executionId: string,
    tokenAddress: string,
    userRiskLevel: 'conservative' | 'moderate' | 'aggressive'
  ): Promise<{
    shouldContinue: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'extreme';
    riskScore: number;
    actions: Array<{
      type: 'continue' | 'pause' | 'stop' | 'adjust';
      reason: string;
      urgency: 'low' | 'medium' | 'high';
    }>;
  }> {
    console.log(`[RiskAgent] Monitoring ongoing risk for execution ${executionId}`);

    try {
      // Get current market assessment
      const currentAssessment = await this.assessRisk({
        sessionId,
        tokenAddress,
        userRiskLevel,
        budget: 1000, // Placeholder for monitoring
      });

      const { assessment } = currentAssessment;
      const threshold = this.riskThresholds[userRiskLevel];

      const actions: Array<{
        type: 'continue' | 'pause' | 'stop' | 'adjust';
        reason: string;
        urgency: 'low' | 'medium' | 'high';
      }> = [];

      let shouldContinue = true;

      // Check risk thresholds
      if (assessment.riskScore > threshold.maxRiskScore) {
        shouldContinue = false;
        actions.push({
          type: 'stop',
          reason: `Risk score (${(assessment.riskScore * 100).toFixed(1)}%) exceeds maximum threshold for ${userRiskLevel} profile`,
          urgency: 'high',
        });
      } else if (assessment.riskScore > threshold.warningThreshold) {
        actions.push({
          type: 'adjust',
          reason: `Risk score approaching threshold, consider adjusting strategy`,
          urgency: 'medium',
        });
      }

      // Check for extreme conditions
      if (assessment.overallRisk === 'extreme') {
        shouldContinue = false;
        actions.push({
          type: 'stop',
          reason: 'Extreme market conditions detected, halting execution for safety',
          urgency: 'high',
        });
      }

      // Check specific risk factors
      if (assessment.factors.volatilityRisk > 0.8) {
        actions.push({
          type: 'pause',
          reason: 'High volatility detected, consider pausing until conditions stabilize',
          urgency: 'medium',
        });
      }

      if (assessment.factors.liquidityRisk > 0.7) {
        actions.push({
          type: 'adjust',
          reason: 'Low liquidity detected, consider reducing trade sizes',
          urgency: 'medium',
        });
      }

      // If no issues, recommend continuing
      if (actions.length === 0) {
        actions.push({
          type: 'continue',
          reason: 'Risk levels within acceptable parameters',
          urgency: 'low',
        });
      }

      // Emit monitoring event
      await eventSystem.emit({
        type: 'risk_assessment_changed',
        sessionId,
        source: 'risk_management_agent',
        data: {
          executionId,
          riskLevel: assessment.overallRisk,
          riskScore: assessment.riskScore,
          shouldContinue,
          actionCount: actions.length,
        },
      });

      return {
        shouldContinue,
        riskLevel: assessment.overallRisk,
        riskScore: assessment.riskScore,
        actions,
      };

    } catch (error) {
      console.error(`[RiskAgent] Risk monitoring failed:`, error);

      // In case of error, default to cautious approach
      return {
        shouldContinue: false,
        riskLevel: 'extreme',
        riskScore: 1.0,
        actions: [{
          type: 'stop',
          reason: 'Risk monitoring system error, halting for safety',
          urgency: 'high',
        }],
      };
    }
  }

  async getRiskHistory(sessionId: string, tokenAddress?: string): Promise<Array<{
    timestamp: number;
    riskLevel: string;
    riskScore: number;
    tokenAddress: string;
    userRiskLevel: string;
  }>> {
    const artifacts = artifactsManager.query({
      sessionId,
      type: 'risk_assessment',
      source: 'risk_analysis_tool',
    });

    return artifacts
      .filter(artifact => !tokenAddress || artifact.data.tokenAddress === tokenAddress)
      .map(artifact => ({
        timestamp: artifact.createdAt,
        riskLevel: artifact.data.overallRisk as string,
        riskScore: artifact.data.riskScore as number,
        tokenAddress: artifact.data.tokenAddress as string,
        userRiskLevel: 'moderate', // Would be stored in metadata
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  private generateRiskMitigationStrategies(
    assessment: any,
    userRiskLevel: string,
    marketData: any,
    volatilityMetrics: any
  ): string[] {
    const strategies: string[] = [];

    // Volatility-based strategies
    if (assessment.factors.volatilityRisk > 0.6) {
      strategies.push('Increase number of legs to reduce impact of individual trades');
      strategies.push('Use smaller position sizes per leg to minimize single-trade risk');
      if (volatilityMetrics.category === 'high') {
        strategies.push('Consider implementing time-based delays between trades');
      }
    }

    // Liquidity-based strategies
    if (assessment.factors.liquidityRisk > 0.5) {
      strategies.push('Split large orders into smaller chunks to improve execution');
      strategies.push('Avoid trading during low-volume periods');
      strategies.push('Consider using limit orders instead of market orders');
    }

    // Timing-based strategies
    if (assessment.factors.timingRisk > 0.5) {
      strategies.push('Implement randomized timing to avoid predictable patterns');
      strategies.push('Avoid trading during major market events');
    }

    // Risk level specific strategies
    if (userRiskLevel === 'conservative') {
      strategies.push('Set tighter stop-loss conditions');
      strategies.push('Monitor market conditions more frequently');
    } else if (userRiskLevel === 'aggressive') {
      strategies.push('Consider opportunity-based acceleration during favorable conditions');
    }

    return strategies;
  }

  private generateMonitoringRecommendations(
    assessment: any,
    volatilityMetrics: any,
    userRiskLevel: string
  ): string[] {
    const recommendations: string[] = [];

    // Base monitoring frequency
    const baseFrequency = userRiskLevel === 'conservative' ? 30 : userRiskLevel === 'moderate' ? 60 : 120;
    let monitoringFrequency = baseFrequency;

    // Adjust based on risk level
    if (assessment.overallRisk === 'high' || assessment.overallRisk === 'extreme') {
      monitoringFrequency = Math.max(15, monitoringFrequency / 2);
      recommendations.push(`Monitor execution every ${monitoringFrequency} minutes due to high risk conditions`);
    } else {
      recommendations.push(`Regular monitoring every ${monitoringFrequency} minutes is sufficient`);
    }

    // Volatility-specific monitoring
    if (volatilityMetrics.category === 'high') {
      recommendations.push('Enable real-time price alerts for significant movements (>5%)');
      recommendations.push('Monitor trading volume for liquidity changes');
    }

    // Risk factor specific monitoring
    if (assessment.factors.liquidityRisk > 0.6) {
      recommendations.push('Track order book depth before each trade');
    }

    if (assessment.factors.timingRisk > 0.6) {
      recommendations.push('Monitor for major market events and news');
    }

    return recommendations;
  }

  private generateEmergencyProtocols(
    assessment: any,
    userRiskLevel: string,
    budget: number
  ): string[] {
    const protocols: string[] = [];

    // Risk score based protocols
    if (assessment.riskScore > 0.8) {
      protocols.push('IMMEDIATE HALT: Stop all pending trades if risk score exceeds 80%');
    } else if (assessment.riskScore > 0.6) {
      protocols.push('CAUTION: Reduce trade sizes by 50% if risk score exceeds 60%');
    }

    // Volatility protocols
    if (assessment.factors.volatilityRisk > 0.8) {
      protocols.push('VOLATILITY HALT: Pause execution if 24h price movement exceeds 20%');
    }

    // Liquidity protocols
    if (assessment.factors.liquidityRisk > 0.7) {
      protocols.push('LIQUIDITY CHECK: Verify order book depth before each trade');
    }

    // Budget protection
    const maxSingleLoss = budget * (userRiskLevel === 'conservative' ? 0.05 : userRiskLevel === 'moderate' ? 0.10 : 0.15);
    protocols.push(`LOSS LIMIT: Halt if single trade loss exceeds $${maxSingleLoss.toFixed(2)}`);

    // General protocols
    protocols.push('SYSTEM ERROR: Stop all trades if monitoring systems fail');
    protocols.push('MANUAL OVERRIDE: Allow immediate manual halt via emergency stop');

    return protocols;
  }

  private async checkRiskThresholds(result: RiskAssessmentResult): Promise<void> {
    const { assessment, userRiskLevel, sessionId, tokenAddress } = result;
    const threshold = this.riskThresholds[userRiskLevel];

    if (assessment.riskScore > threshold.maxRiskScore) {
      await eventSystem.emitAgentWarning(
        'risk_management_agent',
        `Risk score (${(assessment.riskScore * 100).toFixed(1)}%) exceeds maximum threshold for ${userRiskLevel} profile`,
        sessionId,
        { tokenAddress, riskScore: assessment.riskScore, threshold: threshold.maxRiskScore }
      );
    } else if (assessment.riskScore > threshold.warningThreshold) {
      await eventSystem.emitAgentWarning(
        'risk_management_agent',
        `Risk score approaching threshold for ${userRiskLevel} profile`,
        sessionId,
        { tokenAddress, riskScore: assessment.riskScore, threshold: threshold.warningThreshold }
      );
    }

    if (assessment.overallRisk === 'extreme') {
      await eventSystem.emitAgentWarning(
        'risk_management_agent',
        'EXTREME RISK CONDITIONS DETECTED - Consider halting DCA execution',
        sessionId,
        { tokenAddress, riskFactors: assessment.factors }
      );
    }
  }

  private async handleRiskTrigger(sessionId: string, tokenAddress: string, eventType: string): Promise<void> {
    console.log(`[RiskAgent] Handling risk trigger for ${tokenAddress} (${eventType})`);

    // Clear cache for this token to force fresh assessment
    for (const [key] of this.assessmentCache.entries()) {
      if (key.includes(tokenAddress)) {
        this.assessmentCache.delete(key);
      }
    }

    // Get user risk level from session
    const userRiskLevel = sessionStateManager.getState(sessionId, 'risk_level', 'moderate') as 'conservative' | 'moderate' | 'aggressive';

    try {
      // Trigger new risk assessment
      await this.assessRisk({
        sessionId,
        tokenAddress,
        userRiskLevel,
        budget: 1000, // Placeholder for monitoring
      });
    } catch (error) {
      console.error(`[RiskAgent] Failed to handle risk trigger:`, error);
    }
  }

  // Analytics and reporting
  getRiskStats(): {
    totalAssessments: number;
    riskDistribution: Record<string, number>;
    averageRiskScore: number;
    warningsIssued: number;
    emergencyStops: number;
  } {
    // This would be implemented with proper metrics collection
    return {
      totalAssessments: this.assessmentCache.size,
      riskDistribution: { low: 40, medium: 35, high: 20, extreme: 5 },
      averageRiskScore: 0.45,
      warningsIssued: 12,
      emergencyStops: 2,
    };
  }
}

export const riskManagementAgent = new RiskManagementAgent();