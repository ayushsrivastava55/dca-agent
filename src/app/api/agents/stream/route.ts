import { eventStreamManager } from '@/agents/streaming/event-stream';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    const tokenAddress = url.searchParams.get('tokenAddress');
    const eventTypes = url.searchParams.get('eventTypes')?.split(',');
    const streamType = url.searchParams.get('type') || 'session';

    console.log(`[API] Creating event stream: type=${streamType}, session=${sessionId}, token=${tokenAddress}`);

    let streamResult;

    switch (streamType) {
      case 'session':
        if (!sessionId) {
          return new Response('sessionId is required for session streams', { status: 400 });
        }
        streamResult = eventStreamManager.createSessionStream(
          sessionId,
          eventTypes as any[]
        );
        break;

      case 'market':
        streamResult = eventStreamManager.createMarketStream(tokenAddress || undefined);
        break;

      case 'execution':
        if (!sessionId) {
          return new Response('sessionId is required for execution streams', { status: 400 });
        }
        const executionId = url.searchParams.get('executionId');
        streamResult = eventStreamManager.createExecutionStream(sessionId, executionId || undefined);
        break;

      case 'monitoring':
        streamResult = eventStreamManager.createMonitoringStream(sessionId || undefined);
        break;

      default:
        streamResult = eventStreamManager.createEventStream(
          sessionId || undefined,
          eventTypes as any[]
        );
    }

    // Set SSE headers
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    };

    console.log(`[API] Event stream created with subscription ID: ${streamResult.subscriptionId}`);

    return new Response(streamResult.stream, { headers });

  } catch (error) {
    console.error('[API] Failed to create event stream:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'stream_creation_failed',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Manage stream subscriptions
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, subscriptionId, eventTypes, active } = body;

    if (!action || !subscriptionId) {
      return new Response(JSON.stringify({
        error: 'missing_parameters',
        message: 'action and subscriptionId are required',
      }), { status: 400 });
    }

    let result = false;

    switch (action) {
      case 'update':
        result = eventStreamManager.updateSubscription(subscriptionId, {
          eventTypes,
          active,
        });
        break;

      case 'close':
        eventStreamManager.closeStream(subscriptionId);
        result = true;
        break;

      default:
        return new Response(JSON.stringify({
          error: 'invalid_action',
          message: 'action must be "update" or "close"',
        }), { status: 400 });
    }

    return Response.json({
      success: result,
      subscriptionId,
      action,
    });

  } catch (error) {
    console.error('[API] Failed to manage stream subscription:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'stream_management_failed',
    }), { status: 500 });
  }
}

// Get stream statistics
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const subscriptionId = url.searchParams.get('subscriptionId');

    if (!subscriptionId) {
      return new Response(JSON.stringify({
        error: 'missing_subscription_id',
        message: 'subscriptionId is required',
      }), { status: 400 });
    }

    eventStreamManager.closeStream(subscriptionId);

    return Response.json({
      success: true,
      message: 'Stream closed successfully',
      subscriptionId,
    });

  } catch (error) {
    console.error('[API] Failed to close stream:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'stream_close_failed',
    }), { status: 500 });
  }
}