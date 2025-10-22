"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import type { Delegation } from "@metamask/delegation-toolkit";
import { useAccount } from "wagmi";
import ConnectButton from "@/components/ConnectButton";
import NetworkStatus from "@/components/NetworkStatus";
import SmartAccountStatus from "@/components/SmartAccountStatus";
import AgentDashboard from "@/components/AgentDashboard";
import { createDelegation, revokeDelegation } from "@/lib/delegation";
import { useWalletClient } from "wagmi";
import { useSmartAccount } from "@/hooks/useSmartAccount";
import { Button, Card } from "pixel-retroui";
import EnvioPanel from "@/components/EnvioPanel";

export default function Home() {
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { smartAddress } = useSmartAccount();
  const [tokenIn, setTokenIn] = useState("MON");
  const [tokenOut, setTokenOut] = useState("USDC");
  const [budget, setBudget] = useState("100");
  const [legs, setLegs] = useState(4);
  const [intervalMins, setIntervalMins] = useState(60);
  const [router, setRouter] = useState<string>((process.env.NEXT_PUBLIC_DCA_ROUTER_ADDRESS as string) || "");
  const [delegate, setDelegate] = useState("");
  const [spendCap, setSpendCap] = useState("100");
  const [expiry, setExpiry] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [delegationCreated, setDelegationCreated] = useState(false);
  const [permissionContext, setPermissionContext] = useState<Delegation[] | null>(null);
  const [delegationId, setDelegationId] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<{
    status?: string;
    completedLegs?: number;
    totalLegs?: number;
  } | null>(null);
  const [agentStatus, setAgentStatus] = useState<{
    agent?: { status?: string };
    scheduler?: { activeExecutions: number };
  } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusPolling, setStatusPolling] = useState<NodeJS.Timeout | null>(null);

  const plan = useMemo(() => {
    const b = parseFloat(budget) || 0;
    const n = Number(legs) || 0;
    const iv = Number(intervalMins) || 0;
    if (!b || !n || !iv) return [] as { index: number; amount: number; at: Date }[];
    const amt = b / n;
    const now = new Date();
    return Array.from({ length: n }).map((_, i) => ({ index: i + 1, amount: amt, at: new Date(now.getTime() + i * iv * 60_000) }));
  }, [budget, legs, intervalMins]);

  const [aiPlan, setAiPlan] = useState<{ index: number; amount: number; atISO: string; strategy?: string }[] | null>(null);
  const [aiStrategy, setAiStrategy] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  // Helper functions
  function addLog(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    setLogs(prev => [logEntry, ...prev.slice(0, 49)]); // Keep last 50 logs
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'active': case 'executing': return 'text-blue-600';
      case 'completed': return 'text-green-600';
      case 'failed': case 'error': return 'text-red-600';
      case 'paused': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  }

  function getStatusBadge(status: string) {
    const baseClass = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case 'active': case 'executing': return `${baseClass} bg-blue-100 text-blue-800`;
      case 'completed': return `${baseClass} bg-green-100 text-green-800`;
      case 'failed': case 'error': return `${baseClass} bg-red-100 text-red-800`;
      case 'paused': return `${baseClass} bg-yellow-100 text-yellow-800`;
      case 'pending': return `${baseClass} bg-gray-100 text-gray-800`;
      default: return `${baseClass} bg-gray-100 text-gray-600`;
    }
  }

  async function generateAIPlan() {
    try {
      setAiErr(null);
      setAiBusy(true);
      addLog("Generating AI-optimized DCA plan...", 'info');

      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenIn,
          tokenOut,
          budget: parseFloat(budget) || 0,
          legs,
          intervalMins,
        }),
      });

      if (!res.ok) throw new Error(`plan_failed:${res.status}`);
      const data = await res.json();

      if (data.plan) {
        setAiPlan(data.plan);
        setAiStrategy(data.strategy);
        addLog(`AI plan generated with ${data.plan.length} legs`, 'success');
        if (data.strategy) {
          addLog(`Strategy: ${data.strategy}`, 'info');
        }
      } else {
        throw new Error("No plan returned from AI");
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : "plan_error";
      setAiErr(error);
      addLog(`Failed to generate AI plan: ${error}`, 'error');
    } finally {
      setAiBusy(false);
    }
  }

  async function startExecution() {
    if (!delegationId || !smartAddress || !delegate || !router || !permissionContext) return;

    try {
      setBusy(true);
      const planToUse = aiPlan || plan;
      addLog("Starting DCA execution...", 'info');

      const res = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          delegationId,
          delegator: smartAddress,
          delegate,
          router,
          plan: planToUse,
          tokenIn,
          tokenOut,
          permissionContext,
        }),
      });

      if (!res.ok) throw new Error(`execution_failed:${res.status}`);
      const data = await res.json();

      setExecutionId(data.executionId);
      addLog(`Execution scheduled with ID: ${data.executionId}`, 'success');
      addLog(`Agent address: ${data.agentAddress}`, 'info');
      addLog(`Scheduled ${data.scheduledLegs} legs for execution`, 'info');

      // Start polling for status updates
      startStatusPolling(data.executionId);

    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : "execution_error";
      addLog(`Failed to start execution: ${error}`, 'error');
      alert(`Failed to start execution: ${error}`);
    } finally {
      setBusy(false);
    }
  }

  function startStatusPolling(execId: string) {
    // Clear any existing polling
    if (statusPolling) {
      clearInterval(statusPolling);
    }

    // Poll every 10 seconds
    const interval = setInterval(async () => {
      try {
        const [execRes, agentRes] = await Promise.all([
          fetch(`/api/agent/execute?executionId=${execId}`),
          fetch('/api/agent/status')
        ]);

        if (execRes.ok) {
          const execData = await execRes.json();
          setExecutionStatus(execData.execution);
        }

        if (agentRes.ok) {
          const agentData = await agentRes.json();
          setAgentStatus(agentData);
        }
      } catch (error) {
        console.warn("Status polling error:", error);
      }
    }, 10000);

    setStatusPolling(interval);
  }

  const stopStatusPolling = useCallback(() => {
    if (statusPolling) {
      clearInterval(statusPolling);
      setStatusPolling(null);
    }
  }, [statusPolling]);

  // Initialize with welcome message
  useEffect(() => {
    addLog("DCA Sitter initialized", 'info');
    addLog("Connect wallet and create delegation to start", 'info');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStatusPolling();
    };
  }, [stopStatusPolling]);

  const [showLegacyInterface, setShowLegacyInterface] = useState(false);

  return (
    <div className="min-h-screen p-6 sm:p-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="text-2xl sm:text-3xl font-semibold">DCA Sitter</div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowLegacyInterface(!showLegacyInterface)} className="px-3 py-1 text-sm">
              {showLegacyInterface ? '🤖 AI Dashboard' : '⚙️ Legacy Interface'}
            </Button>
            <NetworkStatus />
            <SmartAccountStatus />
            <ConnectButton />
          </div>
        </header>

        {!showLegacyInterface ? (
          <AgentDashboard />
        ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-[var(--surface)] text-black p-6">
            <div className="text-lg font-medium mb-4">DCA Configuration</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm">Token In</label>
                <input className="rounded-lg px-3 py-2 bg-white border border-black/10" value={tokenIn} onChange={(e) => setTokenIn(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm">Token Out</label>
                <input className="rounded-lg px-3 py-2 bg-white border border-black/10" value={tokenOut} onChange={(e) => setTokenOut(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm">Total Budget</label>
                <input type="number" min={0} className="rounded-lg px-3 py-2 bg-white border border-black/10" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm">Number of Legs</label>
                <input type="number" min={1} className="rounded-lg px-3 py-2 bg-white border border-black/10" value={legs} onChange={(e) => setLegs(Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm">Interval (minutes)</label>
                <input type="number" min={1} className="rounded-lg px-3 py-2 bg-white border border-black/10" value={intervalMins} onChange={(e) => setIntervalMins(Number(e.target.value))} />
              </div>
              <div className="flex items-end">
                <Button onClick={generateAIPlan} disabled={aiBusy} className="px-5 py-2 text-sm">
                  {aiBusy ? "Generating…" : "Generate with AI"}
                </Button>
              </div>
            </div>
            {aiErr && <div className="mt-3 text-sm text-red-600">{aiErr}</div>}
          </Card>

          <Card className="bg-[var(--surface)] text-black p-6">
            <div className="text-lg font-medium mb-4">Delegation</div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm">Delegate Address (agent)</label>
                <input className="rounded-lg px-3 py-2 bg-white border border-black/10" placeholder="0x..." value={delegate} onChange={(e) => setDelegate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm">DCA Router Address (scope)</label>
                <input className="rounded-lg px-3 py-2 bg-white border border-black/10" placeholder="0x..." value={router} onChange={(e) => setRouter(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm">Spend Cap</label>
                <input type="number" min={0} className="rounded-lg px-3 py-2 bg-white border border-black/10" value={spendCap} onChange={(e) => setSpendCap(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm">Expiry</label>
                <input type="datetime-local" className="rounded-lg px-3 py-2 bg-white border border-black/10" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={async () => {
                    try {
                      setBusy(true);
                      addLog("Creating delegation...", 'info');

                      if (!walletClient || !smartAddress || !delegate) {
                        throw new Error("Wallet not connected or delegate address missing");
                      }

                      addLog(`Creating delegation from ${smartAddress} to ${delegate}`, 'info');
                      addLog(`Router: ${router}, Spend cap: ${spendCap}`, 'info');

                      const rec = await createDelegation({
                        router: router as `0x${string}`,
                        spendCap,
                        expiry,
                        walletClient,
                        from: smartAddress as `0x${string}`,
                        to: delegate as `0x${string}`,
                      });

                      setDelegationId(rec.id);
                      setDelegationCreated(true);
                      setPermissionContext(rec.permissionContext || null);
                      addLog(`Delegation created successfully! ID: ${rec.id}`, 'success');
                      addLog("You can now start execution", 'info');

                    } catch (error: unknown) {
                      const err = error instanceof Error ? error.message : 'Delegation creation failed';
                      addLog(`Delegation failed: ${err}`, 'error');
                      alert(`Delegation failed: ${err}`);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={!isConnected || !router || !delegate || !walletClient || !smartAddress || busy}
                  className="px-5 py-2 text-sm"
                >
                  {busy ? "Creating…" : "Create Delegation"}
                </Button>

                {delegationCreated && !executionId && (
                  <Button onClick={startExecution} disabled={busy || !delegationId} className="px-5 py-2 text-sm">
                    {busy ? "Starting…" : "Start Execution"}
                  </Button>
                )}

                <Button
                  onClick={async () => {
                    if (!delegationId) return;
                    try {
                      setBusy(true);
                      addLog("Revoking delegation...", 'warning');

                      await revokeDelegation();

                      // Stop status polling
                      stopStatusPolling();

                      setPermissionContext(null);
                      setDelegationCreated(false);
                      setDelegationId(null);
                      setExecutionId(null);
                      setExecutionStatus(null);
                      setAgentStatus(null);

                      addLog("Delegation revoked successfully", 'success');
                      addLog("All executions stopped", 'info');

                    } catch (error: unknown) {
                      const err = error instanceof Error ? error.message : 'Revocation failed';
                      addLog(`Revocation failed: ${err}`, 'error');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={!delegationCreated || busy}
                  className="px-5 py-2 text-sm"
                >
                  {busy ? "Revoking…" : "Revoke"}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* AI Strategy Display */}
        {aiStrategy && (
          <Card className="bg-blue-50 border border-blue-200 text-black p-4">
            <div className="text-sm font-medium text-blue-800 mb-2">AI Strategy</div>
            <div className="text-sm text-blue-700">{aiStrategy}</div>
          </Card>
        )}

        {/* Status Dashboard */}
        {(delegationCreated || executionId || agentStatus) && (
          <Card className="bg-[var(--surface)] text-black p-6">
            <div className="text-lg font-medium mb-4">Status Dashboard</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Delegation Status */}
              <div className="bg-white rounded-lg p-4 border border-black/10">
                <div className="text-sm font-medium text-gray-600 mb-2">Delegation</div>
                <div className={`text-lg font-semibold ${delegationCreated ? 'text-green-600' : 'text-gray-400'}`}>
                  {delegationCreated ? '✓ Active' : '○ Not Created'}
                </div>
                {delegationId && (
                  <div className="text-xs text-gray-500 mt-1 font-mono">
                    {delegationId}
                  </div>
                )}
              </div>

              {/* Execution Status */}
              <div className="bg-white rounded-lg p-4 border border-black/10">
                <div className="text-sm font-medium text-gray-600 mb-2">Execution</div>
                <div className={getStatusColor(executionStatus?.status || 'inactive')}>
                  <div className="text-lg font-semibold">
                    {executionStatus?.status ?
                      executionStatus.status.charAt(0).toUpperCase() +
                      executionStatus.status.slice(1) : 'Not Started'}
                  </div>
                  {executionStatus && (
                    <div className="text-sm mt-1">
                      {executionStatus?.completedLegs || 0} / {executionStatus?.totalLegs || 0} legs completed
                    </div>
                  )}
                </div>
              </div>

              {/* Agent Status */}
              <div className="bg-white rounded-lg p-4 border border-black/10">
                <div className="text-sm font-medium text-gray-600 mb-2">Agent</div>
                <div className="text-lg font-semibold text-blue-600">
                  {agentStatus?.agent?.status || 'Unknown'}
                </div>
                {agentStatus?.scheduler && (
                  <div className="text-sm text-gray-600 mt-1">
                    {agentStatus.scheduler.activeExecutions} active executions
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            {executionStatus?.totalLegs && executionStatus.totalLegs > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Progress</span>
                  <span>{Math.round(((executionStatus?.completedLegs || 0) / executionStatus.totalLegs) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((executionStatus as { completedLegs?: number }).completedLegs || 0) / (executionStatus as { totalLegs: number }).totalLegs * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </Card>
        )}

        <Card className="bg-[var(--surface)] text-black p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-lg font-medium">Execution Timeline</div>
            <div className="flex items-center gap-2">
              <span className={getStatusBadge((executionStatus as { status?: string })?.status || 'inactive')}>
                {(executionStatus as { status?: string })?.status || 'Inactive'}
              </span>
              {executionId && <span className="text-xs text-gray-500">ID: {executionId.slice(0, 8)}...</span>}
            </div>
          </div>
          <div className="space-y-2">
            {(aiPlan ? aiPlan.length === 0 : plan.length === 0) ? (
              <div className="text-sm text-gray-500">No plan generated</div>
            ) : (
              (aiPlan
                ? aiPlan.map((p) => {
                    // Get leg status from execution status
                    const execStatusTyped = executionStatus as { plan?: { index: number; status?: string; txHash?: string }[] } | null;
                    const legStatus = execStatusTyped?.plan?.find((ep) => ep.index === p.index)?.status || 'pending';
                    const txHash = execStatusTyped?.plan?.find((ep) => ep.index === p.index)?.txHash;

                    return (
                      <div key={p.index} className="flex items-center justify-between rounded-lg bg-white p-3 border border-black/10">
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-medium">Leg {p.index}</div>
                          {legStatus === 'executing' && (
                            <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                          )}
                        </div>
                        <div className="text-sm">{Number(p.amount).toFixed(4)} {tokenIn}</div>
                        <div className="text-sm">{new Date(p.atISO).toLocaleString()}</div>
                        <div className="flex items-center gap-2">
                          <span className={getStatusBadge(legStatus)}>{legStatus}</span>
                          {txHash && (
                            <a
                              href={`https://testnet.monadexplorer.com/tx/${txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              TX
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })
                : plan.map((p) => {
                    const execStatusTyped = executionStatus as { plan?: { index: number; status?: string; txHash?: string }[] } | null;
                    const legStatus = execStatusTyped?.plan?.find((ep) => ep.index === p.index)?.status || 'pending';
                    const txHash = execStatusTyped?.plan?.find((ep) => ep.index === p.index)?.txHash;

                    return (
                      <div key={p.index} className="flex items-center justify-between rounded-lg bg-white p-3 border border-black/10">
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-medium">Leg {p.index}</div>
                          {legStatus === 'executing' && (
                            <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                          )}
                        </div>
                        <div className="text-sm">{p.amount.toFixed(4)} {tokenIn}</div>
                        <div className="text-sm">{p.at.toLocaleString()}</div>
                        <div className="flex items-center gap-2">
                          <span className={getStatusBadge(legStatus)}>{legStatus}</span>
                          {txHash && (
                            <a
                              href={`https://testnet.monadexplorer.com/tx/${txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              TX
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  }))
            )}
          </div>
        </Card>

        {/* Activity Log */}
        <Card className="bg-[var(--surface)] text-black p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-lg font-medium">Activity Log</div>
            <Button onClick={() => setLogs([])} className="text-xs px-3 py-1">
              Clear
            </Button>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 h-48 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-400 text-sm">No activity yet...</div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="text-xs font-mono text-gray-300 break-all">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <EnvioPanel />

        <Card className="border border-white/10 p-6">
          <div className="text-sm mb-2">Monad Testnet</div>
          <div className="flex gap-3 text-sm">
            <a className="underline" href="https://faucet.monad.xyz/" target="_blank" rel="noreferrer">Faucet</a>
            <a className="underline" href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer">Explorer</a>
            <a className="underline" href="https://docs.monad.xyz/" target="_blank" rel="noreferrer">Docs</a>
          </div>
        </Card>
        </>
        )}
      </div>
    </div>
  );
}
