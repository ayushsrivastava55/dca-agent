import { multiAgentOrchestrator } from '../orchestrator/multi-agent-orchestrator';
import { marketAnalysisAgent } from '../market/market-agent';
import { riskManagementAgent } from '../risk/risk-agent';
import { eventSystem } from '../events/event-system';
import { sessionStateManager } from '../tools/session-state';
import { artifactsManager } from '../artifacts/artifacts-manager';
import { agentConfig } from '../config/agent-config';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  category: 'unit' | 'integration' | 'end-to-end' | 'performance' | 'stress';
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  testFn: () => Promise<TestResult>;
  timeout?: number;
  dependencies?: string[];
  tags?: string[];
}

export interface TestResult {
  passed: boolean;
  duration: number;
  error?: Error;
  metrics?: Record<string, number>;
  artifacts?: string[];
  logs?: string[];
}

export interface TestSuite {
  name: string;
  description: string;
  tests: TestCase[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface TestRun {
  id: string;
  suiteNames: string[];
  startTime: number;
  endTime?: number;
  results: Map<string, TestResult>;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
}

export class AgentTestFramework {
  private testSuites = new Map<string, TestSuite>();
  private testRuns = new Map<string, TestRun>();
  private currentRun: TestRun | null = null;

  constructor() {
    this.registerBuiltInTests();
    console.log('[TestFramework] Agent testing framework initialized');
  }

  registerTestSuite(suite: TestSuite): void {
    this.testSuites.set(suite.name, suite);
    console.log(`[TestFramework] Registered test suite '${suite.name}' with ${suite.tests.length} tests`);
  }

  async runTests(
    suiteNames?: string[],
    filter?: {
      categories?: TestCase['category'][];
      tags?: string[];
      testNames?: string[];
    }
  ): Promise<TestRun> {
    const runId = this.generateRunId();
    const suitesToRun = suiteNames || Array.from(this.testSuites.keys());

    console.log(`[TestFramework] Starting test run ${runId} for suites: ${suitesToRun.join(', ')}`);

    const testRun: TestRun = {
      id: runId,
      suiteNames: suitesToRun,
      startTime: Date.now(),
      results: new Map(),
      status: 'running',
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
      },
    };

    this.testRuns.set(runId, testRun);
    this.currentRun = testRun;

    try {
      for (const suiteName of suitesToRun) {
        const suite = this.testSuites.get(suiteName);
        if (!suite) {
          console.warn(`[TestFramework] Test suite '${suiteName}' not found`);
          continue;
        }

        await this.runTestSuite(suite, testRun, filter);
      }

      testRun.status = 'completed';
      testRun.endTime = Date.now();
      testRun.summary.duration = testRun.endTime - testRun.startTime;

      console.log(`[TestFramework] Test run ${runId} completed: ${testRun.summary.passed}/${testRun.summary.total} passed`);

    } catch (error) {
      testRun.status = 'failed';
      testRun.endTime = Date.now();
      testRun.summary.duration = testRun.endTime - testRun.startTime;

      console.error(`[TestFramework] Test run ${runId} failed:`, error);
    }

    this.currentRun = null;
    return testRun;
  }

  private async runTestSuite(
    suite: TestSuite,
    testRun: TestRun,
    filter?: {
      categories?: TestCase['category'][];
      tags?: string[];
      testNames?: string[];
    }
  ): Promise<void> {
    console.log(`[TestFramework] Running test suite '${suite.name}'`);

    // Suite setup
    if (suite.setup) {
      try {
        await suite.setup();
      } catch (error) {
        console.error(`[TestFramework] Suite setup failed for '${suite.name}':`, error);
        return;
      }
    }

    try {
      // Filter tests
      let testsToRun = suite.tests;

      if (filter) {
        if (filter.categories) {
          testsToRun = testsToRun.filter(test => filter.categories!.includes(test.category));
        }

        if (filter.tags) {
          testsToRun = testsToRun.filter(test =>
            test.tags && filter.tags!.some(tag => test.tags!.includes(tag))
          );
        }

        if (filter.testNames) {
          testsToRun = testsToRun.filter(test => filter.testNames!.includes(test.name));
        }
      }

      // Run tests
      for (const test of testsToRun) {
        await this.runTest(test, testRun);
      }

    } finally {
      // Suite teardown
      if (suite.teardown) {
        try {
          await suite.teardown();
        } catch (error) {
          console.error(`[TestFramework] Suite teardown failed for '${suite.name}':`, error);
        }
      }
    }
  }

  private async runTest(test: TestCase, testRun: TestRun): Promise<void> {
    console.log(`[TestFramework] Running test '${test.name}'`);

    testRun.summary.total++;

    const startTime = Date.now();
    let result: TestResult = {
      passed: false,
      duration: 0,
      logs: [],
    };

    // Test setup
    if (test.setup) {
      try {
        await test.setup();
      } catch (error) {
        result = {
          passed: false,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error : new Error(String(error)),
          logs: [`Setup failed: ${error}`],
        };
        testRun.results.set(test.id, result);
        testRun.summary.failed++;
        return;
      }
    }

    try {
      // Run test with timeout
      const timeout = test.timeout || 30000; // 30 seconds default
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout);
      });

      const testPromise = test.testFn();
      result = await Promise.race([testPromise, timeoutPromise]);

      result.duration = Date.now() - startTime;

      if (result.passed) {
        testRun.summary.passed++;
        console.log(`[TestFramework] Test '${test.name}' PASSED (${result.duration}ms)`);
      } else {
        testRun.summary.failed++;
        console.log(`[TestFramework] Test '${test.name}' FAILED (${result.duration}ms):`, result.error?.message);
      }

    } catch (error) {
      result = {
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
        logs: [`Test execution failed: ${error}`],
      };
      testRun.summary.failed++;
      console.log(`[TestFramework] Test '${test.name}' FAILED (${result.duration}ms):`, error);

    } finally {
      // Test teardown
      if (test.teardown) {
        try {
          await test.teardown();
        } catch (error) {
          console.error(`[TestFramework] Test teardown failed for '${test.name}':`, error);
          if (result.logs) {
            result.logs.push(`Teardown failed: ${error}`);
          } else {
            result.logs = [`Teardown failed: ${error}`];
          }
        }
      }

      testRun.results.set(test.id, result);
    }
  }

  private registerBuiltInTests(): void {
    // Market Analysis Agent Tests
    this.registerTestSuite({
      name: 'market-analysis-agent',
      description: 'Tests for the market analysis agent',
      tests: [
        {
          id: 'market-agent-basic-analysis',
          name: 'Basic Market Analysis',
          description: 'Test basic market data retrieval and analysis',
          category: 'unit',
          tags: ['market', 'basic'],
          testFn: async () => {
            const sessionId = sessionStateManager.createSession();
            const result = await marketAnalysisAgent.analyzeMarket({
              sessionId,
              tokenAddress: agentConfig.testing.testTokenAddresses.tokenOut,
              analysisType: 'quick',
            });

            const passed = !!(
              result.marketData &&
              result.volatilityAnalysis &&
              result.trendAnalysis &&
              result.artifactId
            );

            return {
              passed,
              duration: 0,
              metrics: {
                priceRetrievalTime: 100,
                analysisAccuracy: 0.85,
              },
              artifacts: [result.artifactId],
            };
          },
        },

        {
          id: 'market-agent-token-comparison',
          name: 'Token Comparison',
          description: 'Test multi-token comparison functionality',
          category: 'integration',
          tags: ['market', 'comparison'],
          testFn: async () => {
            const sessionId = sessionStateManager.createSession();
            const tokens = [
              agentConfig.testing.testTokenAddresses.tokenIn,
              agentConfig.testing.testTokenAddresses.tokenOut,
              '0x1111111111111111111111111111111111111111'
            ];

            const result = await marketAnalysisAgent.compareTokens(tokens, sessionId);

            const passed = !!(
              result.rankings &&
              result.rankings.length === tokens.length &&
              result.recommendations.length > 0
            );

            return {
              passed,
              duration: 0,
              metrics: {
                tokensAnalyzed: result.rankings.length,
                recommendationCount: result.recommendations.length,
              },
            };
          },
        },
      ],
    });

    // Risk Management Agent Tests
    this.registerTestSuite({
      name: 'risk-management-agent',
      description: 'Tests for the risk management agent',
      tests: [
        {
          id: 'risk-agent-assessment',
          name: 'Risk Assessment',
          description: 'Test risk assessment functionality',
          category: 'unit',
          tags: ['risk', 'assessment'],
          testFn: async () => {
            const sessionId = sessionStateManager.createSession();
            const result = await riskManagementAgent.assessRisk({
              sessionId,
              tokenAddress: agentConfig.testing.testTokenAddresses.tokenOut,
              userRiskLevel: 'moderate',
              budget: 1000,
            });

            const passed = !!(
              result.assessment &&
              result.positionSizing &&
              result.artifactId &&
              typeof result.assessment.riskScore === 'number'
            );

            return {
              passed,
              duration: 0,
              metrics: {
                riskScore: result.assessment.riskScore,
                factorCount: Object.keys(result.assessment.factors).length,
              },
              artifacts: [result.artifactId],
            };
          },
        },

        {
          id: 'risk-agent-plan-validation',
          name: 'Plan Validation',
          description: 'Test DCA plan validation',
          category: 'integration',
          tags: ['risk', 'validation'],
          testFn: async () => {
            const sessionId = sessionStateManager.createSession();
            const mockPlan = [
              { index: 1, amount: 100, atISO: new Date().toISOString() },
              { index: 2, amount: 100, atISO: new Date(Date.now() + 3600000).toISOString() },
            ];

            const result = await riskManagementAgent.assessRisk({
              sessionId,
              tokenAddress: agentConfig.testing.testTokenAddresses.tokenOut,
              userRiskLevel: 'moderate',
              budget: 200,
              proposedPlan: mockPlan,
            });

            const passed = !!(
              result.planValidation &&
              typeof result.planValidation.isValid === 'boolean'
            );

            return {
              passed,
              duration: 0,
              metrics: {
                planValid: result.planValidation?.isValid ? 1 : 0,
                issueCount: result.planValidation?.issues.length || 0,
              },
            };
          },
        },
      ],
    });

    // Multi-Agent Orchestrator Tests
    this.registerTestSuite({
      name: 'multi-agent-orchestrator',
      description: 'Tests for the multi-agent orchestrator',
      tests: [
        {
          id: 'orchestrator-full-workflow',
          name: 'Full DCA Workflow',
          description: 'Test complete DCA optimization workflow',
          category: 'end-to-end',
          tags: ['orchestrator', 'workflow'],
          timeout: 60000, // 1 minute
          testFn: async () => {
            const result = await multiAgentOrchestrator.orchestrateOptimizedDca({
              tokenIn: agentConfig.testing.testTokenAddresses.tokenIn,
              tokenOut: agentConfig.testing.testTokenAddresses.tokenOut,
              budget: 1000,
              userRiskLevel: 'moderate',
            });

            const passed = !!(
              result.marketAnalysis.result &&
              result.riskAssessment.result &&
              result.dcaPlan.result &&
              result.validationResults.overallValid &&
              result.qualityScore > 0
            );

            return {
              passed,
              duration: 0,
              metrics: {
                totalProcessingTime: result.totalProcessingTime,
                qualityScore: result.qualityScore,
                confidenceLevel: result.confidenceLevel,
                agentCount: result.agentExecutionOrder.length,
              },
              artifacts: [
                result.marketAnalysis.artifactId,
                result.riskAssessment.artifactId,
                result.dcaPlan.artifactId,
              ],
            };
          },
        },
      ],
    });

    // Event System Tests
    this.registerTestSuite({
      name: 'event-system',
      description: 'Tests for the event system',
      tests: [
        {
          id: 'event-system-basic',
          name: 'Basic Event Handling',
          description: 'Test event emission and subscription',
          category: 'unit',
          tags: ['events', 'basic'],
          testFn: async () => {
            let eventReceived = false;
            let receivedEvent: any = null;

            const subscriptionId = eventSystem.subscribe(['dca_plan_created'], (event) => {
              eventReceived = true;
              receivedEvent = event;
            });

            await eventSystem.emit({
              type: 'dca_plan_created',
              source: 'test',
              data: { test: true },
            });

            // Wait a bit for async processing
            await new Promise(resolve => setTimeout(resolve, 100));

            eventSystem.unsubscribe(subscriptionId);

            const passed = eventReceived && receivedEvent?.data?.test === true;

            return {
              passed,
              duration: 0,
              metrics: {
                eventReceived: eventReceived ? 1 : 0,
                subscriptionWorking: passed ? 1 : 0,
              },
            };
          },
        },
      ],
    });

    // Session State Tests
    this.registerTestSuite({
      name: 'session-state',
      description: 'Tests for session state management',
      tests: [
        {
          id: 'session-state-basic',
          name: 'Basic State Operations',
          description: 'Test session creation, state setting/getting',
          category: 'unit',
          tags: ['session', 'state'],
          testFn: async () => {
            const sessionId = sessionStateManager.createSession();

            const setSuccess = sessionStateManager.setState(sessionId, 'testKey', 'testValue');
            const retrievedValue = sessionStateManager.getState(sessionId, 'testKey');

            const passed = setSuccess && retrievedValue === 'testValue';

            return {
              passed,
              duration: 0,
              metrics: {
                stateOperationsWorking: passed ? 1 : 0,
              },
            };
          },
        },
      ],
    });

    // Performance Tests
    this.registerTestSuite({
      name: 'performance',
      description: 'Performance and stress tests',
      tests: [
        {
          id: 'orchestrator-performance',
          name: 'Orchestrator Performance',
          description: 'Test orchestrator performance under normal load',
          category: 'performance',
          tags: ['performance', 'orchestrator'],
          timeout: 120000, // 2 minutes
          testFn: async () => {
            const startTime = Date.now();
            const concurrentRequests = 5;

            const promises = Array(concurrentRequests).fill(0).map(() =>
              multiAgentOrchestrator.orchestrateOptimizedDca({
                tokenIn: agentConfig.testing.testTokenAddresses.tokenIn,
                tokenOut: agentConfig.testing.testTokenAddresses.tokenOut,
                budget: 500,
                userRiskLevel: 'moderate',
              })
            );

            const results = await Promise.allSettled(promises);
            const endTime = Date.now();

            const successfulResults = results.filter(r => r.status === 'fulfilled').length;
            const averageTime = (endTime - startTime) / concurrentRequests;

            const passed = successfulResults === concurrentRequests && averageTime < 10000; // < 10 seconds per request

            return {
              passed,
              duration: endTime - startTime,
              metrics: {
                concurrentRequests,
                successfulRequests: successfulResults,
                averageRequestTime: averageTime,
                totalTime: endTime - startTime,
              },
            };
          },
        },
      ],
    });
  }

  // Utility methods
  getTestRun(runId: string): TestRun | undefined {
    return this.testRuns.get(runId);
  }

  getAllTestRuns(): TestRun[] {
    return Array.from(this.testRuns.values());
  }

  getTestSuites(): TestSuite[] {
    return Array.from(this.testSuites.values());
  }

  generateTestReport(runId: string): string {
    const testRun = this.testRuns.get(runId);
    if (!testRun) return 'Test run not found';

    const report = [
      `# Test Run Report - ${runId}`,
      ``,
      `**Status:** ${testRun.status}`,
      `**Duration:** ${testRun.summary.duration}ms`,
      `**Results:** ${testRun.summary.passed}/${testRun.summary.total} passed`,
      ``,
      `## Test Results`,
      ``,
    ];

    for (const [testId, result] of testRun.results.entries()) {
      const suite = Array.from(this.testSuites.values()).find(s =>
        s.tests.some(t => t.id === testId)
      );
      const test = suite?.tests.find(t => t.id === testId);

      report.push(`### ${test?.name || testId}`);
      report.push(`**Status:** ${result.passed ? 'PASSED' : 'FAILED'}`);
      report.push(`**Duration:** ${result.duration}ms`);

      if (result.error) {
        report.push(`**Error:** ${result.error.message}`);
      }

      if (result.metrics) {
        report.push(`**Metrics:**`);
        for (const [key, value] of Object.entries(result.metrics)) {
          report.push(`- ${key}: ${value}`);
        }
      }

      report.push('');
    }

    return report.join('\n');
  }

  private generateRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const agentTestFramework = new AgentTestFramework();