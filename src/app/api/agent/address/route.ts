import { getDcaExecutor, isExecutorAvailable } from "@/agents/dca/executor";

export async function GET() {
  try {
    // Check if server-side executor is available (optional feature)
    if (!isExecutorAvailable()) {
      return Response.json({ 
        success: false, 
        error: "Server-side automated execution not configured. Users can execute delegations client-side using their own wallet.",
        info: "To enable automated execution, set AGENT_PRIVATE_KEY in your environment."
      }, { status: 200 }); // Changed to 200 since this is a valid state, not an error
    }

    try {
      const exec = getDcaExecutor();
      return Response.json({ success: true, address: exec.address });
    } catch (execError) {
      // If executor instantiation fails, return informative response
      return Response.json({ 
        success: false, 
        error: execError instanceof Error ? execError.message : "agent_address_error",
        info: "Server-side executor is not available. Use client-side execution instead."
      }, { status: 200 }); // Still 200 since this is acceptable
    }
  } catch (e: unknown) {
    return Response.json({ 
      success: false, 
      error: e instanceof Error ? e.message : "agent_address_error" 
    }, { status: 500 });
  }
}
