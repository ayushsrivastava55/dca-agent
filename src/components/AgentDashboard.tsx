"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { Button, Card } from "pixel-retroui";

interface AgentMetrics {
  qualityScore: number;
  confidenceLevel: number;
  processingTime: number;
  agentExecutionOrder: string[];
}

interface OrchestrationResult {
  orchestrationId: string;
  sessionId: string;
  result: {
    plan: Array<{ index: number; amount: number; atISO: string; reasoning?: string }>;
    strategy?: string;
    totalAmount?: number;
    marketAnalysis: {
      volatility: string;
      trend: string;
      tradingScore: number;
      recommendations?: any;
    };
    riskAssessment: {
      overallRisk: string;
      riskScore: number;
      positionSizing: any;
      warnings: string[];
    };
    validation: {
      marketValidation: boolean;
      riskValidation: boolean;
      planValidation: boolean;
      overallValid: boolean;
    };
    qualityMetrics: AgentMetrics;
  };
  recommendations: string[];
  warnings: string[];
  metadata: {
    agentExecutionOrder: string[];
    artifacts: {
      marketAnalysis: string;
      riskAssessment: string;
    };
    streamSubscriptionId?: string;
    callbackId?: string;
  };
}

interface AlertItem {
  id: string;
  threshold: {
    metricPath: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    value: number;
    severity: 'info' | 'warning' | 'error' | 'critical';
  };
  triggeredAt: number;
  currentValue: number;
  previousValue?: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  sessionId?: string;
  acknowledged: boolean;
}

export default function AgentDashboard() {
  const { address, isConnected } = useAccount();
  const [tokenIn, setTokenIn] = useState("0xUSDC");
  const [tokenOut, setTokenOut] = useState("0xETH");
  const [budget, setBudget] = useState("1000");
  const [userRiskLevel, setUserRiskLevel] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [orchestrationResult, setOrchestrationResult] = useState<OrchestrationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev.slice(-50), `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  // Connect to event stream
  const connectEventStream = useCallback((sessionId: string) => {
    if (eventSource) {
      eventSource.close();
    }

    const url = `/api/agents/stream?type=session&sessionId=${sessionId}`;
    const newEventSource = new EventSource(url);

    newEventSource.onopen = () => {
      setStreamConnected(true);
      addLog('Connected to real-time event stream');
    };

    newEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'event':
            addLog(`Event: ${data.data.type} from ${data.data.source}`);
            if (data.data.type === 'dca_leg_executed') {
              addLog(`DCA leg ${data.data.data.legIndex} executed: $${data.data.data.amount}`);
            }
            break;
          case 'heartbeat':
            // Silent heartbeat
            break;
          case 'error':
            addLog(`Stream error: ${data.data.error}`);
            break;
        }
      } catch (err) {
        console.error('Failed to parse stream message:', err);
      }
    };

    newEventSource.onerror = () => {
      setStreamConnected(false);
      addLog('Event stream disconnected');
    };

    setEventSource(newEventSource);
  }, [eventSource, addLog]);

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/agents/metrics?type=summary&timeRange=1h');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.summary);
        setAlerts(data.activeAlerts || []);
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  }, []);

  // Start DCA orchestration
  const startOrchestration = async () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet');
      return;
    }

    if (!tokenIn || !tokenOut || !budget || parseFloat(budget) <= 0) {
      setError('Please fill in all required fields with valid values');
      return;
    }

    setLoading(true);
    setError(null);
    setOrchestrationResult(null);
    addLog('Starting multi-agent DCA orchestration...');

    try {
      const response = await fetch('/api/agents/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenIn,
          tokenOut,
          budget: parseFloat(budget),
          userRiskLevel,
          userId: address,
          enableStreaming: true,
          preferences: {
            userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setOrchestrationResult(data);
        addLog(`Orchestration completed successfully`);
        addLog(`Quality Score: ${(data.result.qualityMetrics.qualityScore * 100).toFixed(1)}%`);
        addLog(`Confidence Level: ${(data.result.qualityMetrics.confidenceLevel * 100).toFixed(1)}%`);
        addLog(`Processing Time: ${data.result.qualityMetrics.processingTime}ms`);

        // Connect to event stream for this session
        if (data.metadata.streamSubscriptionId) {
          connectEventStream(data.sessionId);
        }

        // Log recommendations and warnings
        data.recommendations.forEach((rec: string) => addLog(`💡 ${rec}`));
        data.warnings.forEach((warn: string) => addLog(`⚠️ ${warn}`));

      } else {
        throw new Error(data.error || 'Orchestration failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      addLog(`❌ Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Run agent tests
  const runTests = async (testType: string) => {
    setLoading(true);
    addLog(`Running ${testType} tests...`);

    try {
      const response = await fetch('/api/agents/test', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: `run_${testType}_tests` }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const { summary } = data.testRun;
        addLog(`✅ Tests completed: ${summary.passed}/${summary.total} passed`);
        if (summary.failed > 0) {
          addLog(`❌ ${summary.failed} tests failed`);
        }
      } else {
        throw new Error(data.error || 'Test run failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      addLog(`❌ Test error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    const interval = setInterval(fetchMetrics, 30000); // Fetch metrics every 30 seconds
    fetchMetrics(); // Initial fetch

    return () => {
      clearInterval(interval);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [fetchMetrics, eventSource]);

  const formatQualityScore = (score: number) => {
    const percentage = (score * 100).toFixed(1);
    if (score >= 0.8) return <span className="text-green-600 font-semibold">{percentage}%</span>;
    if (score >= 0.6) return <span className="text-yellow-600 font-semibold">{percentage}%</span>;
    return <span className="text-red-600 font-semibold">{percentage}%</span>;
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'high': return 'text-orange-600';
      case 'extreme': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card className="p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🤖 Multi-Agent DCA Orchestrator
          </h1>
          <p className="text-gray-600">
            AI-powered dollar-cost averaging with advanced market analysis and risk management
          </p>
          <div className="mt-4 flex items-center space-x-4">
            <div className={`px-3 py-1 rounded-full text-sm ${
              streamConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {streamConnected ? '🟢 Stream Connected' : '⚫ Stream Disconnected'}
            </div>
            <div className={`px-3 py-1 rounded-full text-sm ${
              isConnected ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
            }`}>
              {isConnected ? '🔗 Wallet Connected' : '🔴 Wallet Not Connected'}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration Panel */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">🎯 DCA Configuration</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token In (Address)
                </label>
                <input
                  type="text"
                  value={tokenIn}
                  onChange={(e) => setTokenIn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token Out (Address)
                </label>
                <input
                  type="text"
                  value={tokenOut}
                  onChange={(e) => setTokenOut(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Budget (USD)
                </label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Risk Level
                </label>
                <select
                  value={userRiskLevel}
                  onChange={(e) => setUserRiskLevel(e.target.value as 'conservative' | 'moderate' | 'aggressive')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="conservative">🛡️ Conservative</option>
                  <option value="moderate">⚖️ Moderate</option>
                  <option value="aggressive">🚀 Aggressive</option>
                </select>
              </div>

              <Button onClick={startOrchestration} disabled={loading || !isConnected} className="w-full py-2 px-4">
                {loading ? '⏳ Processing...' : '🚀 Start AI Orchestration'}
              </Button>

              {error && (
                <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}
            </div>
          </Card>

          {/* System Status */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">📊 System Status</h2>

            {/* Alerts */}
            {alerts.length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium text-red-600 mb-2">🚨 Active Alerts</h3>
                <div className="space-y-2">
                  {alerts.map(alert => (
                    <div key={alert.id} className={`p-2 rounded text-sm ${
                      alert.threshold.severity === 'critical' ? 'bg-red-100 text-red-800' :
                      alert.threshold.severity === 'error' ? 'bg-orange-100 text-orange-800' :
                      alert.threshold.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {alert.threshold.metricPath}: {alert.currentValue} (threshold: {alert.threshold.operator} {alert.threshold.value})
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Performance Metrics */}
            {metrics && (
              <div className="space-y-3">
                <h3 className="font-medium">🤖 Agent Performance</h3>

                {Object.entries(metrics).map(([agentType, agentMetrics]: [string, any]) => (
                  <div key={agentType} className="border rounded p-3">
                    <div className="font-medium text-sm mb-2">
                      {agentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>Requests: {agentMetrics.totalRequests}</div>
                      <div>Success: {agentMetrics.successRate.toFixed(1)}%</div>
                      <div>Avg Time: {agentMetrics.averageExecutionTime.toFixed(0)}ms</div>
                      <div>Quality: {formatQualityScore(agentMetrics.qualityScore)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Test Controls */}
            <div className="mt-6 space-y-2">
              <h3 className="font-medium">🧪 System Tests</h3>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => runTests('quick_check')} disabled={loading} className="px-3 py-1 text-sm">
                  Quick Check
                </Button>
                <Button onClick={() => runTests('integration')} disabled={loading} className="px-3 py-1 text-sm">
                  Integration
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Results Panel */}
        {orchestrationResult && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">📈 Orchestration Results</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Plan Summary */}
              <div>
                <h3 className="font-medium mb-3">📋 DCA Plan</h3>
                <div className="space-y-2 text-sm">
                  <div>Legs: {orchestrationResult.result.plan.length}</div>
                  <div>Total: ${orchestrationResult.result.totalAmount?.toFixed(2)}</div>
                  <div>Strategy: {orchestrationResult.result.strategy}</div>
                </div>

                <div className="mt-3 max-h-40 overflow-y-auto">
                  {orchestrationResult.result.plan.map(leg => (
                    <div key={leg.index} className="text-xs border-l-2 border-blue-200 pl-2 py-1">
                      Leg {leg.index}: ${leg.amount.toFixed(2)} at {new Date(leg.atISO).toLocaleString()}
                    </div>
                  ))}
                </div>
              </div>

              {/* Market Analysis */}
              <div>
                <h3 className="font-medium mb-3">📊 Market Analysis</h3>
                <div className="space-y-2 text-sm">
                  <div>Volatility: <span className="font-medium">{orchestrationResult.result.marketAnalysis.volatility}</span></div>
                  <div>Trend: <span className="font-medium">{orchestrationResult.result.marketAnalysis.trend}</span></div>
                  <div>Trading Score: {formatQualityScore(orchestrationResult.result.marketAnalysis.tradingScore)}</div>
                </div>
              </div>

              {/* Risk Assessment */}
              <div>
                <h3 className="font-medium mb-3">⚠️ Risk Assessment</h3>
                <div className="space-y-2 text-sm">
                  <div>Risk Level: <span className={`font-medium ${getRiskColor(orchestrationResult.result.riskAssessment.overallRisk)}`}>
                    {orchestrationResult.result.riskAssessment.overallRisk}
                  </span></div>
                  <div>Risk Score: {(orchestrationResult.result.riskAssessment.riskScore * 100).toFixed(1)}%</div>
                  <div>Recommended Size: ${orchestrationResult.result.riskAssessment.positionSizing.recommendedLegSize.toFixed(2)}</div>
                </div>

                {orchestrationResult.result.riskAssessment.warnings.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-red-600">Warnings:</div>
                    {orchestrationResult.result.riskAssessment.warnings.map((warning, i) => (
                      <div key={i} className="text-xs text-red-600">{warning}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quality Metrics */}
            <div className="mt-6 p-4 bg-gray-50 rounded">
              <h3 className="font-medium mb-2">🏆 Quality Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Quality Score</div>
                  <div className="font-semibold">{formatQualityScore(orchestrationResult.result.qualityMetrics.qualityScore)}</div>
                </div>
                <div>
                  <div className="text-gray-600">Confidence</div>
                  <div className="font-semibold">{formatQualityScore(orchestrationResult.result.qualityMetrics.confidenceLevel)}</div>
                </div>
                <div>
                  <div className="text-gray-600">Processing Time</div>
                  <div className="font-semibold">{orchestrationResult.result.qualityMetrics.processingTime}ms</div>
                </div>
                <div>
                  <div className="text-gray-600">Agents Used</div>
                  <div className="font-semibold">{orchestrationResult.result.qualityMetrics.agentExecutionOrder.length}</div>
                </div>
              </div>
            </div>

            {/* Validation Status */}
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <h3 className="font-medium mb-2">✅ Validation Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {Object.entries(orchestrationResult.result.validation).map(([key, value]) => (
                  <div key={key}>
                    <div className="text-gray-600">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</div>
                    <div className={`font-semibold ${value ? 'text-green-600' : 'text-red-600'}`}>
                      {value ? '✅' : '❌'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Logs Panel */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">📝 System Logs</h2>
          <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded h-64 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className="mb-1">{log}</div>
            ))}
            {logs.length === 0 && (
              <div className="text-gray-500">No logs yet. Start an orchestration to see activity.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}