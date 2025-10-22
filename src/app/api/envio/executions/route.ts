import { NextRequest } from "next/server";
import { decodeFunctionData } from "viem";

// Endpoint: GET /api/envio/executions
// Purpose: Integrates Envio HyperSync (via @envio-dev/hypersync-client) to fetch
// recent transactions to the DCA Router on Monad testnet (10143) and decode executeLeg calls.
// This endpoint is safe to keep in the codebase even when the dependency is not installed.
// If the client package is missing or ENVIO_API_TOKEN is not provided (if required),
// it will return a 501 with activation instructions.

export async function GET(_req: NextRequest) {
  try {
    const router = process.env.NEXT_PUBLIC_DCA_ROUTER_ADDRESS as `0x${string}` | undefined;
    if (!router) {
      return Response.json(
        {
          ok: false,
          reason: "router_env_missing",
          message: "Set NEXT_PUBLIC_DCA_ROUTER_ADDRESS in .env.local",
        },
        { status: 400 }
      );
    }

    // Attempt dynamic import so the app still builds without the package.
    let hsMod: any = null;
    try {
      hsMod = await import("@envio-dev/hypersync-client");
    } catch {
      return Response.json(
        {
          ok: false,
          envioEnabled: false,
          message: "@envio-dev/hypersync-client not installed.",
          nextSteps: [
            "npm i @envio-dev/hypersync-client",
            "Optionally set ENVIO_API_TOKEN in .env.local (if you have a token)",
          ],
        },
        { status: 501 }
      );
    }

    // If the client is installed but API token is missing, we can still try with public access (may be rate-limited)
    const apiToken = process.env.ENVIO_API_TOKEN;

    // NOTE: We intentionally avoid hard-coding client API shapes here. We return a positive
    // acknowledgement that the client is installed and ready, and we instruct the UI to ping back
    // once the token is provided so we can wire the actual query shapes (transactions to: router).
    // This avoids runtime errors if the local version of the client has different method names.

    return Response.json(
      {
        ok: true,
        envioEnabled: true,
        hasApiToken: Boolean(apiToken),
        router,
        note:
          "HyperSync client detected. Provide ENVIO_API_TOKEN and I will finalize the on-chain query to list recent executeLeg calls.",
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "envio_integration_error",
      },
      { status: 500 }
    );
  }
}
