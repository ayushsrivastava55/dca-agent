import { metricsCollector } from '@/agents/evaluation/metrics';
import { agentTestFramework } from '@/agents/testing/test-framework';
import { eventStreamManager } from '@/agents/streaming/event-stream';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'summary';
    const agentType = url.searchParams.get('agentType');
    const sessionId = url.searchParams.get('sessionId');
    const timeRange = url.searchParams.get('timeRange');

    let startTime = 0;
    let endTime = Date.now();

    // Parse time range
    if (timeRange) {
      const range = timeRange.split(',');
      if (range.length === 2) {
        startTime = parseInt(range[0]);
        endTime = parseInt(range[1]);
      } else {
        // Named ranges
        const now = Date.now();
        switch (timeRange) {
          case '1h':
            startTime = now - 60 * 60 * 1000;
            break;
          case '24h':
            startTime = now - 24 * 60 * 60 * 1000;
            break;
          case '7d':
            startTime = now - 7 * 24 * 60 * 60 * 1000;
            break;
          case '30d':
            startTime = now - 30 * 24 * 60 * 60 * 1000;
            break;
          default:
            startTime = now - 24 * 60 * 60 * 1000; // Default to 24h
        }
      }
    }

    const timeRangeObj = { start: startTime, end: endTime };

    switch (type) {
      case 'summary':
        const agentTypes = ['market_analysis_agent', 'risk_management_agent', 'dca_agent', 'multi_agent_orchestrator'];
        const summary = {};

        for (const type of agentTypes) {
          (summary as any)[type] = metricsCollector.calculateAggregateMetrics(type, timeRangeObj);
        }

        return Response.json({
          success: true,
          timeRange: { start: startTime, end: endTime },
          summary,
          systemMetrics: metricsCollector.getSystemMetrics(timeRangeObj).slice(-1)[0], // Latest
          activeAlerts: metricsCollector.getActiveAlerts(),
        });

      case 'agent':
        if (!agentType) {
          return new Response(JSON.stringify({
            error: 'missing_agent_type',
            message: 'agentType parameter is required for agent metrics',
          }), { status: 400 });
        }

        const agentMetrics = metricsCollector.getAgentMetrics(agentType, sessionId || undefined, timeRangeObj);
        const aggregates = metricsCollector.calculateAggregateMetrics(agentType, timeRangeObj);

        return Response.json({
          success: true,
          agentType,
          sessionId,
          timeRange: timeRangeObj,
          metrics: agentMetrics,
          aggregates,
        });

      case 'system':
        const systemMetrics = metricsCollector.getSystemMetrics(timeRangeObj);

        return Response.json({
          success: true,
          timeRange: timeRangeObj,
          systemMetrics,
          streamStats: eventStreamManager.getStreamStats(),
        });

      case 'report':
        const report = metricsCollector.generatePerformanceReport(timeRangeObj);

        return Response.json({
          success: true,
          timeRange: timeRangeObj,
          report,
          format: 'markdown',
        });

      case 'alerts':
        const alerts = metricsCollector.getActiveAlerts();

        return Response.json({
          success: true,
          alerts,
          alertCount: alerts.length,
        });

      case 'test-results':
        const testRuns = agentTestFramework.getAllTestRuns();
        const latestRun = testRuns.length > 0 ? testRuns[testRuns.length - 1] : null;

        return Response.json({
          success: true,
          testRuns: testRuns.slice(-10), // Last 10 runs
          latestRun,
          testSuites: agentTestFramework.getTestSuites().map(suite => ({
            name: suite.name,
            description: suite.description,
            testCount: suite.tests.length,
          })),
        });

      default:
        return new Response(JSON.stringify({
          error: 'invalid_type',
          message: 'type must be one of: summary, agent, system, report, alerts, test-results',
        }), { status: 400 });
    }

  } catch (error) {
    console.error('[API] Failed to get metrics:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'metrics_fetch_failed',
    }), { status: 500 });
  }
}

// Record custom metrics
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentType, sessionId, metrics, customMetrics } = body;

    if (!agentType || !metrics) {
      return new Response(JSON.stringify({
        error: 'missing_parameters',
        message: 'agentType and metrics are required',
      }), { status: 400 });
    }

    // Validate metrics structure
    const requiredFields = ['performance', 'quality', 'userExperience', 'business'];
    for (const field of requiredFields) {
      if (!metrics[field]) {
        return new Response(JSON.stringify({
          error: 'invalid_metrics',
          message: `metrics.${field} is required`,
        }), { status: 400 });
      }
    }

    const agentMetrics = {
      agentId: `${agentType}_${sessionId || 'global'}`,
      agentType,
      sessionId,
      timestamp: Date.now(),
      performance: metrics.performance,
      quality: metrics.quality,
      userExperience: metrics.userExperience,
      business: metrics.business,
      custom: customMetrics || {},
    };

    metricsCollector.recordAgentMetrics(agentMetrics);

    return Response.json({
      success: true,
      message: 'Metrics recorded successfully',
      agentType,
      sessionId,
      timestamp: agentMetrics.timestamp,
    });

  } catch (error) {
    console.error('[API] Failed to record metrics:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'metrics_recording_failed',
    }), { status: 500 });
  }
}

// Manage metric thresholds and alerts
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { action, alertId, threshold } = body;

    if (!action) {
      return new Response(JSON.stringify({
        error: 'missing_action',
        message: 'action is required',
      }), { status: 400 });
    }

    switch (action) {
      case 'acknowledge_alert':
        if (!alertId) {
          return new Response(JSON.stringify({
            error: 'missing_alert_id',
            message: 'alertId is required for acknowledge_alert action',
          }), { status: 400 });
        }

        const acknowledged = metricsCollector.acknowledgeAlert(alertId);

        return Response.json({
          success: acknowledged,
          alertId,
          message: acknowledged ? 'Alert acknowledged' : 'Alert not found',
        });

      case 'add_threshold':
        if (!threshold) {
          return new Response(JSON.stringify({
            error: 'missing_threshold',
            message: 'threshold is required for add_threshold action',
          }), { status: 400 });
        }

        metricsCollector.addThreshold(threshold);

        return Response.json({
          success: true,
          message: 'Threshold added successfully',
          threshold,
        });

      case 'remove_threshold':
        if (!threshold?.metricPath) {
          return new Response(JSON.stringify({
            error: 'missing_metric_path',
            message: 'threshold.metricPath is required for remove_threshold action',
          }), { status: 400 });
        }

        const removed = metricsCollector.removeThreshold(threshold.metricPath);

        return Response.json({
          success: removed,
          metricPath: threshold.metricPath,
          message: removed ? 'Threshold removed' : 'Threshold not found',
        });

      default:
        return new Response(JSON.stringify({
          error: 'invalid_action',
          message: 'action must be one of: acknowledge_alert, add_threshold, remove_threshold',
        }), { status: 400 });
    }

  } catch (error) {
    console.error('[API] Failed to manage metrics:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'metrics_management_failed',
    }), { status: 500 });
  }
}