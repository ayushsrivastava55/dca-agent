import { agentTestFramework } from '@/agents/testing/test-framework';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      suites = [],
      filter = {},
      parallel = false,
    } = body;

    console.log(`[API] Starting test run for suites: ${suites.length > 0 ? suites.join(', ') : 'all'}`);

    // Validate filter
    if (filter.categories) {
      const validCategories = ['unit', 'integration', 'end-to-end', 'performance', 'stress'];
      const invalidCategories = filter.categories.filter((c: string) => !validCategories.includes(c));
      if (invalidCategories.length > 0) {
        return new Response(JSON.stringify({
          error: 'invalid_categories',
          message: `Invalid categories: ${invalidCategories.join(', ')}`,
          validCategories,
        }), { status: 400 });
      }
    }

    const startTime = Date.now();

    // Run tests
    const testRun = await agentTestFramework.runTests(
      suites.length > 0 ? suites : undefined,
      filter
    );

    const duration = Date.now() - startTime;

    console.log(`[API] Test run completed in ${duration}ms: ${testRun.summary.passed}/${testRun.summary.total} passed`);

    return Response.json({
      success: true,
      testRun: {
        id: testRun.id,
        status: testRun.status,
        summary: testRun.summary,
        suiteNames: testRun.suiteNames,
        startTime: testRun.startTime,
        endTime: testRun.endTime,
        duration,
      },
      results: Array.from(testRun.results.entries()).map(([testId, result]) => ({
        testId,
        ...result,
      })),
      filter,
    });

  } catch (error) {
    console.error('[API] Test run failed:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'test_run_failed',
    }), { status: 500 });
  }
}

// Get test information
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'suites';
    const runId = url.searchParams.get('runId');

    switch (type) {
      case 'suites':
        const testSuites = agentTestFramework.getTestSuites();

        return Response.json({
          success: true,
          testSuites: testSuites.map(suite => ({
            name: suite.name,
            description: suite.description,
            testCount: suite.tests.length,
            tests: suite.tests.map(test => ({
              id: test.id,
              name: test.name,
              description: test.description,
              category: test.category,
              tags: test.tags,
              timeout: test.timeout,
            })),
          })),
        });

      case 'runs':
        const testRuns = agentTestFramework.getAllTestRuns();

        return Response.json({
          success: true,
          testRuns: testRuns.map(run => ({
            id: run.id,
            status: run.status,
            summary: run.summary,
            suiteNames: run.suiteNames,
            startTime: run.startTime,
            endTime: run.endTime,
          })).sort((a, b) => b.startTime - a.startTime),
        });

      case 'run':
        if (!runId) {
          return new Response(JSON.stringify({
            error: 'missing_run_id',
            message: 'runId is required for run type',
          }), { status: 400 });
        }

        const testRun = agentTestFramework.getTestRun(runId);
        if (!testRun) {
          return new Response(JSON.stringify({
            error: 'run_not_found',
            message: `Test run ${runId} not found`,
          }), { status: 404 });
        }

        return Response.json({
          success: true,
          testRun: {
            id: testRun.id,
            status: testRun.status,
            summary: testRun.summary,
            suiteNames: testRun.suiteNames,
            startTime: testRun.startTime,
            endTime: testRun.endTime,
          },
          results: Array.from(testRun.results.entries()).map(([testId, result]) => ({
            testId,
            ...result,
          })),
        });

      case 'report':
        if (!runId) {
          return new Response(JSON.stringify({
            error: 'missing_run_id',
            message: 'runId is required for report type',
          }), { status: 400 });
        }

        const report = agentTestFramework.generateTestReport(runId);

        return Response.json({
          success: true,
          runId,
          report,
          format: 'markdown',
        });

      default:
        return new Response(JSON.stringify({
          error: 'invalid_type',
          message: 'type must be one of: suites, runs, run, report',
        }), { status: 400 });
    }

  } catch (error) {
    console.error('[API] Failed to get test information:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'test_info_fetch_failed',
    }), { status: 500 });
  }
}

// Run specific test categories or individual tests
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case 'run_performance_tests':
        console.log('[API] Running performance test suite');
        const perfRun = await agentTestFramework.runTests(['performance']);

        return Response.json({
          success: true,
          action,
          testRun: {
            id: perfRun.id,
            status: perfRun.status,
            summary: perfRun.summary,
          },
        });

      case 'run_integration_tests':
        console.log('[API] Running integration test suite');
        const integrationRun = await agentTestFramework.runTests(
          undefined,
          { categories: ['integration', 'end-to-end'] }
        );

        return Response.json({
          success: true,
          action,
          testRun: {
            id: integrationRun.id,
            status: integrationRun.status,
            summary: integrationRun.summary,
          },
        });

      case 'run_unit_tests':
        console.log('[API] Running unit test suite');
        const unitRun = await agentTestFramework.runTests(
          undefined,
          { categories: ['unit'] }
        );

        return Response.json({
          success: true,
          action,
          testRun: {
            id: unitRun.id,
            status: unitRun.status,
            summary: unitRun.summary,
          },
        });

      case 'run_quick_check':
        console.log('[API] Running quick health check tests');
        const quickRun = await agentTestFramework.runTests(
          ['market-analysis-agent', 'risk-management-agent'],
          { categories: ['unit'], tags: ['basic'] }
        );

        return Response.json({
          success: true,
          action,
          testRun: {
            id: quickRun.id,
            status: quickRun.status,
            summary: quickRun.summary,
          },
        });

      default:
        return new Response(JSON.stringify({
          error: 'invalid_action',
          message: 'action must be one of: run_performance_tests, run_integration_tests, run_unit_tests, run_quick_check',
        }), { status: 400 });
    }

  } catch (error) {
    console.error('[API] Test action failed:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'test_action_failed',
    }), { status: 500 });
  }
}