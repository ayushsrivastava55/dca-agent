import { marketAnalysisAgent } from '../market/market-agent';
import { riskManagementAgent } from '../risk/risk-agent';
import { createDcaAgent } from '../dca/agent';
import { eventSystem } from '../events/event-system';
import { artifactsManager } from '../artifacts/artifacts-manager';
import { sessionStateManager } from '../tools/session-state';

export interface DcaRequestParams {
  sessionId?: string;
  userId?: string;
  tokenIn: string;
  tokenOut: string;
  budget: number;
  userRiskLevel?: 'conservative' | 'moderate' | 'aggressive';
  preferences?: {
    maxLegs?: number;
    minIntervalMins?: number;
    maxIntervalMins?: number;
    avoidEvents?: boolean;
    userTimezone?: string;
  };
}

export interface OptimizedDcaResult {
  sessionId: string;
  orchestrationId: string;
  timestamp: number;
  request: DcaRequestParams;

  // Agent results
  marketAnalysis: {
    result: any;
    artifactId: string;
    processingTime: number;
  };

  riskAssessment: {
    result: any;
    artifactId: string;
    processingTime: number;
  };

  dcaPlan: {
    result: any;
    artifactId: string;
    processingTime: number;
  };

  // Orchestration metadata
  totalProcessingTime: number;
  agentExecutionOrder: string[];
  validationResults: {
    marketValidation: boolean;
    riskValidation: boolean;
    planValidation: boolean;
    overallValid: boolean;
  };

  // Final recommendations
  recommendations: string[];
  warnings: string[];

  // Quality metrics
  qualityScore: number;
  confidenceLevel: number;

  // Index signature for additional properties
  [key: string]: unknown;
}

export interface WorkflowStep {
  id: string;
  name: string;
  agent: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  result?: any;
  error?: string;
  dependencies: string[];
}

export class MultiAgentOrchestrator {
  private activeOrchestrations = new Map<string, {
    request: DcaRequestParams;
    workflow: WorkflowStep[];
    startTime: number;
    status: 'running' | 'completed' | 'failed';
  }>();

  private dcaAgent: any = null;

  constructor() {
    // Subscribe to agent events for workflow tracking
    eventSystem.subscribe(['agent_error', 'agent_warning'], (event) => {
      this.handleAgentEvent(event);
    });
  }

  async orchestrateOptimizedDca(params: DcaRequestParams): Promise<OptimizedDcaResult> {
    const orchestrationId = this.generateOrchestrationId();
    const sessionId = params.sessionId || sessionStateManager.createSession(params.userId);
    const startTime = Date.now();

    console.log(`[Orchestrator] Starting optimized DCA orchestration ${orchestrationId} for session ${sessionId}`);

    // Initialize session state
    sessionStateManager.updateState(sessionId, {
      orchestration_id: orchestrationId,
      token_in: params.tokenIn,
      token_out: params.tokenOut,
      budget: params.budget,
      risk_level: params.userRiskLevel || 'moderate',
      user_experience: 'intermediate', // Could be derived from user history
      user_timezone: params.preferences?.userTimezone || 'UTC',
      orchestration_start: startTime,
    });

    // Create workflow
    const workflow = this.createWorkflow(params);

    this.activeOrchestrations.set(orchestrationId, {
      request: params,
      workflow,
      startTime,
      status: 'running',
    });

    try {
      // Execute workflow steps
      const results = await this.executeWorkflow(orchestrationId, sessionId, workflow);

      // Validate results
      const validation = this.validateResults(results);

      // Generate final recommendations
      const { recommendations, warnings } = this.generateFinalRecommendations(results, validation);

      // Calculate quality metrics
      const { qualityScore, confidenceLevel } = this.calculateQualityMetrics(results, validation);

      const finalResult: OptimizedDcaResult = {
        sessionId,
        orchestrationId,
        timestamp: Date.now(),
        request: params,
        marketAnalysis: results.marketAnalysis,
        riskAssessment: results.riskAssessment,
        dcaPlan: results.dcaPlan,
        totalProcessingTime: Date.now() - startTime,
        agentExecutionOrder: workflow.filter(step => step.status === 'completed').map(step => step.agent),
        validationResults: validation,
        recommendations,
        warnings,
        qualityScore,
        confidenceLevel,
      };

      // Update orchestration status
      const orchestration = this.activeOrchestrations.get(orchestrationId)!;
      orchestration.status = 'completed';

      // Store final result as artifact
      await artifactsManager.create(
        'optimization_result',
        sessionId,
        finalResult,
        {
          source: 'multi_agent_orchestrator',
          description: `Optimized DCA result for ${params.tokenOut}`,
          tags: ['optimization', 'dca', 'multi-agent', params.tokenOut],
        }
      );

      // Update session state with final results
      sessionStateManager.updateState(sessionId, {
        orchestration_completed: Date.now(),
        final_quality_score: qualityScore,
        final_confidence_level: confidenceLevel,
        recommendations_count: recommendations.length,
        warnings_count: warnings.length,
      });

      // Emit completion event
      await eventSystem.emit({
        type: 'dca_plan_created',
        sessionId,
        source: 'multi_agent_orchestrator',
        data: {
          orchestrationId,
          qualityScore,
          confidenceLevel,
          processingTime: finalResult.totalProcessingTime,
        },
      });

      console.log(`[Orchestrator] Completed orchestration ${orchestrationId} (${finalResult.totalProcessingTime}ms, quality: ${(qualityScore * 100).toFixed(1)}%)`);

      return finalResult;

    } catch (error) {
      console.error(`[Orchestrator] Orchestration ${orchestrationId} failed:`, error);

      // Update orchestration status
      const orchestration = this.activeOrchestrations.get(orchestrationId);
      if (orchestration) {
        orchestration.status = 'failed';
      }

      // Emit error event
      await eventSystem.emitAgentError(
        'multi_agent_orchestrator',
        error instanceof Error ? error : String(error),
        sessionId,
        { orchestrationId, params }
      );

      throw error;
    }
  }

  private createWorkflow(params: DcaRequestParams): WorkflowStep[] {
    return [
      {
        id: 'market_analysis',
        name: 'Market Analysis',
        agent: 'market_analysis_agent',
        status: 'pending',
        dependencies: [],
      },
      {
        id: 'risk_assessment',
        name: 'Risk Assessment',
        agent: 'risk_management_agent',
        status: 'pending',
        dependencies: ['market_analysis'],
      },
      {
        id: 'dca_plan_generation',
        name: 'DCA Plan Generation',
        agent: 'dca_agent',
        status: 'pending',
        dependencies: ['market_analysis', 'risk_assessment'],
      },
      {
        id: 'plan_validation',
        name: 'Plan Validation',
        agent: 'risk_management_agent',
        status: 'pending',
        dependencies: ['dca_plan_generation'],
      },
      {
        id: 'final_optimization',
        name: 'Final Optimization',
        agent: 'dca_agent',
        status: 'pending',
        dependencies: ['plan_validation'],
      },
    ];
  }

  private async executeWorkflow(
    orchestrationId: string,
    sessionId: string,
    workflow: WorkflowStep[]
  ): Promise<{
    marketAnalysis: any;
    riskAssessment: any;
    dcaPlan: any;
  }> {
    const results: any = {};
    const orchestration = this.activeOrchestrations.get(orchestrationId)!;

    for (const step of workflow) {
      // Check if dependencies are met
      const dependenciesMet = step.dependencies.every(depId =>
        workflow.find(s => s.id === depId)?.status === 'completed'
      );

      if (!dependenciesMet) {
        step.status = 'skipped';
        continue;
      }

      step.status = 'running';
      step.startTime = Date.now();

      try {
        console.log(`[Orchestrator] Executing step ${step.name} (${step.agent})`);

        switch (step.id) {
          case 'market_analysis':
            step.result = await marketAnalysisAgent.analyzeMarket({
              sessionId,
              tokenAddress: orchestration.request.tokenOut,
              analysisType: 'comprehensive',
              includeRecommendations: true,
            });
            results.marketAnalysis = {
              result: step.result,
              artifactId: step.result.artifactId,
              processingTime: 0, // Will be calculated
            };
            break;

          case 'risk_assessment':
            step.result = await riskManagementAgent.assessRisk({
              sessionId,
              tokenAddress: orchestration.request.tokenOut,
              userRiskLevel: orchestration.request.userRiskLevel || 'moderate',
              budget: orchestration.request.budget,
              marketData: results.marketAnalysis.result.marketData,
              volatilityMetrics: results.marketAnalysis.result.volatilityAnalysis,
            });
            results.riskAssessment = {
              result: step.result,
              artifactId: step.result.artifactId,
              processingTime: 0, // Will be calculated
            };
            break;

          case 'dca_plan_generation':
            if (!this.dcaAgent) {
              this.dcaAgent = await createDcaAgent();
            }
            step.result = await this.dcaAgent.createOptimizedPlan({
              sessionId,
              tokenIn: orchestration.request.tokenIn,
              tokenOut: orchestration.request.tokenOut,
              budget: orchestration.request.budget,
              legs: results.marketAnalysis.result.dcaRecommendations?.recommendedLegs?.moderate || 8,
              intervalMins: results.marketAnalysis.result.dcaRecommendations?.optimalIntervals?.moderate || 60,
              userRiskLevel: orchestration.request.userRiskLevel || 'moderate',
            });
            results.dcaPlan = {
              result: step.result,
              artifactId: '', // Would be created by DCA agent
              processingTime: 0, // Will be calculated
            };
            break;

          case 'plan_validation':
            // Validate the plan using risk agent
            const validation = await riskManagementAgent.assessRisk({
              sessionId,
              tokenAddress: orchestration.request.tokenOut,
              userRiskLevel: orchestration.request.userRiskLevel || 'moderate',
              budget: orchestration.request.budget,
              proposedPlan: results.dcaPlan.result.plan,
              marketData: results.marketAnalysis.result.marketData,
              volatilityMetrics: results.marketAnalysis.result.volatilityAnalysis,
            });
            step.result = validation;
            break;

          case 'final_optimization':
            // Apply any final optimizations based on validation
            if (step.result?.planValidation && !step.result.planValidation.isValid) {
              // Re-generate plan with adjustments
              step.result = await this.dcaAgent.createOptimizedPlan({
                sessionId,
                tokenIn: orchestration.request.tokenIn,
                tokenOut: orchestration.request.tokenOut,
                budget: orchestration.request.budget,
                legs: Math.min(results.marketAnalysis.result.dcaRecommendations?.recommendedLegs?.moderate || 8, 12),
                intervalMins: Math.max(results.marketAnalysis.result.dcaRecommendations?.optimalIntervals?.moderate || 60, 45),
                userRiskLevel: orchestration.request.userRiskLevel || 'moderate',
              });
              results.dcaPlan = {
                result: step.result,
                artifactId: '',
                processingTime: 0,
              };
            } else {
              step.result = results.dcaPlan.result;
            }
            break;
        }

        step.endTime = Date.now();
        step.status = 'completed';

        // Calculate processing time
        if (results.marketAnalysis && step.id === 'market_analysis') {
          results.marketAnalysis.processingTime = step.endTime - step.startTime!;
        } else if (results.riskAssessment && step.id === 'risk_assessment') {
          results.riskAssessment.processingTime = step.endTime - step.startTime!;
        } else if (results.dcaPlan && (step.id === 'dca_plan_generation' || step.id === 'final_optimization')) {
          results.dcaPlan.processingTime = step.endTime - step.startTime!;
        }

        console.log(`[Orchestrator] Completed step ${step.name} in ${step.endTime - step.startTime!}ms`);

      } catch (error) {
        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        step.endTime = Date.now();

        console.error(`[Orchestrator] Step ${step.name} failed:`, error);

        // For critical steps, fail the entire orchestration
        if (['market_analysis', 'risk_assessment', 'dca_plan_generation'].includes(step.id)) {
          throw new Error(`Critical step ${step.name} failed: ${step.error}`);
        }
      }
    }

    return results;
  }

  private validateResults(results: any): OptimizedDcaResult['validationResults'] {
    const marketValidation = !!(results.marketAnalysis?.result?.marketData &&
                               results.marketAnalysis?.result?.volatilityAnalysis &&
                               results.marketAnalysis?.result?.trendAnalysis);

    const riskValidation = !!(results.riskAssessment?.result?.assessment &&
                             results.riskAssessment?.result?.positionSizing);

    const planValidation = !!(results.dcaPlan?.result?.plan &&
                             Array.isArray(results.dcaPlan.result.plan) &&
                             results.dcaPlan.result.plan.length > 0);

    const overallValid = marketValidation && riskValidation && planValidation;

    return {
      marketValidation,
      riskValidation,
      planValidation,
      overallValid,
    };
  }

  private generateFinalRecommendations(results: any, validation: any): {
    recommendations: string[];
    warnings: string[];
  } {
    const recommendations: string[] = [];
    const warnings: string[] = [];

    // Market-based recommendations
    if (results.marketAnalysis?.result?.dcaRecommendations) {
      recommendations.push(...results.marketAnalysis.result.dcaRecommendations.opportunities);
    }

    // Risk-based recommendations
    if (results.riskAssessment?.result?.assessment) {
      recommendations.push(...results.riskAssessment.result.assessment.recommendations);
      warnings.push(...results.riskAssessment.result.assessment.warnings);
    }

    // Plan-specific recommendations
    if (results.dcaPlan?.result) {
      const plan = results.dcaPlan.result.plan;
      const totalAmount = plan.reduce((sum: number, leg: any) => sum + leg.amount, 0);
      recommendations.push(`Execute ${plan.length} legs over ${this.calculatePlanDuration(plan)} with total amount $${totalAmount.toFixed(2)}`);

      if (results.dcaPlan.result.strategy) {
        recommendations.push(`Strategy: ${results.dcaPlan.result.strategy}`);
      }
    }

    // Validation warnings
    if (!validation.overallValid) {
      warnings.push('Some validation checks failed - please review plan carefully');
    }

    return { recommendations, warnings };
  }

  private calculateQualityMetrics(results: any, validation: any): {
    qualityScore: number;
    confidenceLevel: number;
  } {
    let qualityScore = 0;
    let confidenceLevel = 0;

    // Market analysis quality
    if (results.marketAnalysis?.result) {
      const marketScore = results.marketAnalysis.result.tradingConditions?.score || 0.5;
      qualityScore += marketScore * 0.3;
      confidenceLevel += (results.marketAnalysis.result.volatilityAnalysis?.confidence || 0.7) * 0.3;
    }

    // Risk assessment quality
    if (results.riskAssessment?.result) {
      const riskScore = 1 - results.riskAssessment.result.assessment.riskScore; // Invert risk score
      qualityScore += riskScore * 0.4;
      confidenceLevel += 0.8 * 0.4; // Risk assessment is generally reliable
    }

    // Plan validation quality
    if (validation.overallValid) {
      qualityScore += 0.3;
      confidenceLevel += 0.3;
    }

    return {
      qualityScore: Math.min(qualityScore, 1),
      confidenceLevel: Math.min(confidenceLevel, 1),
    };
  }

  private calculatePlanDuration(plan: Array<{ atISO: string }>): string {
    if (plan.length < 2) return 'immediate';

    const start = new Date(plan[0].atISO);
    const end = new Date(plan[plan.length - 1].atISO);
    const durationMs = end.getTime() - start.getTime();
    const hours = Math.round(durationMs / (1000 * 60 * 60));

    if (hours < 24) return `${hours} hours`;
    const days = Math.round(hours / 24);
    return `${days} days`;
  }

  private async handleAgentEvent(event: any): Promise<void> {
    // Handle agent errors and warnings during orchestration
    console.log(`[Orchestrator] Handling agent event: ${event.type} from ${event.source}`);

    // Could implement retry logic, fallback strategies, etc.
  }

  private generateOrchestrationId(): string {
    return `orch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Analytics and monitoring
  getOrchestrationStats(): {
    activeOrchestrations: number;
    completedOrchestrations: number;
    averageProcessingTime: number;
    successRate: number;
  } {
    const active = Array.from(this.activeOrchestrations.values()).filter(o => o.status === 'running').length;
    const completed = Array.from(this.activeOrchestrations.values()).filter(o => o.status === 'completed').length;
    const failed = Array.from(this.activeOrchestrations.values()).filter(o => o.status === 'failed').length;

    return {
      activeOrchestrations: active,
      completedOrchestrations: completed,
      averageProcessingTime: 5000, // Mock value
      successRate: completed / (completed + failed) || 1,
    };
  }

  getActiveOrchestrations(): Array<{
    id: string;
    status: string;
    startTime: number;
    tokenOut: string;
    currentStep: string;
  }> {
    return Array.from(this.activeOrchestrations.entries()).map(([id, orchestration]) => {
      const currentStep = orchestration.workflow.find(step => step.status === 'running')?.name || 'Unknown';

      return {
        id,
        status: orchestration.status,
        startTime: orchestration.startTime,
        tokenOut: orchestration.request.tokenOut,
        currentStep,
      };
    });
  }
}

export const multiAgentOrchestrator = new MultiAgentOrchestrator();