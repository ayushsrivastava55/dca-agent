"use client";

import { useMemo, useState, useEffect } from "react";
import type { Delegation } from "@metamask/delegation-toolkit";
import { useAccount } from "wagmi";
import ConnectButton from "@/components/ConnectButton";
import NetworkStatus from "@/components/NetworkStatus";
import SmartAccountStatus from "@/components/SmartAccountStatus";
import AgentDashboard from "@/components/AgentDashboard";
import { createDelegation, revokeDelegation } from "@/lib/delegation";
import { executeDelegatedTransaction } from "@/lib/execution";
import { parseUnits, getAddress } from "viem";
import { useWalletClient } from "wagmi";
import { useSmartAccount } from "@/hooks/useSmartAccount";
import { Button, Card } from "pixel-retroui";
import TokenSelector from "@/components/TokenSelector";
import type { TokenInfo } from "@/lib/tokenlist";
import { getTokenList } from "@/lib/tokenlist";
import { useBalance } from "@/hooks/useBalance";

export default function Home() {
  const { isConnected, address: eoaAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { smartAccount, smartAddress, ownerAddress } = useSmartAccount();
  const [tokenIn, setTokenIn] = useState("MON");
  const [tokenOut, setTokenOut] = useState("USDC");
  const [tokenInAddr, setTokenInAddr] = useState<string | null>(null);
  const [tokenOutAddr, setTokenOutAddr] = useState<string | null>(null);
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
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
  const plan = useMemo(() => {
    const b = parseFloat(budget) || 0;
    const n = Number(legs) || 0;
    const iv = Number(intervalMins) || 0;
    if (!b || !n || !iv) return [] as { index: number; amount: number; at: Date }[];
    const amt = b / n;
    const now = new Date();
    return Array.from({ length: n }).map((_, i) => ({ index: i + 1, amount: amt, at: new Date(now.getTime() + i * iv * 60_000) }));
  }, [budget, legs, intervalMins]);

  const [aiPlan, setAiPlan] = useState<{ index: number; amount: number; atISO: string; strategy?: string; status?: 'pending' | 'executing' | 'completed' | 'failed'; txHash?: string }[] | null>(null);
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

  // Initialize with welcome message
  useEffect(() => {
    addLog("🎯 DCA Sitter initialized", 'info');
    addLog("📝 Step 1: Configure your DCA strategy", 'info');
    addLog("✅ Self-delegation enabled - you control execution", 'info');
  }, []);

  // Update step based on state
  useEffect(() => {
    if (!delegationCreated) {
      setCurrentStep('configure');
    } else if (!permissionContext) {
      setCurrentStep('delegate');
    } else if (aiPlan && aiPlan.every(leg => leg.status === 'completed')) {
      setCurrentStep('complete');
    } else if (delegationCreated) {
      setCurrentStep('execute');
    }
  }, [delegationCreated, permissionContext, aiPlan]);

  useEffect(() => {
    (async () => {
      const list = await getTokenList();
      setTokenList(list);
      
      // Prefill delegate with EOA (recommended for self-delegation)
      if (!delegate && (eoaAddress || ownerAddress)) {
        const self = (eoaAddress || ownerAddress)!;
        try {
          const normalized = getAddress(self);
          setDelegate(normalized);
          addLog('Delegate set to your EOA (recommended for client-side execution)', 'info');
        } catch (err: unknown) {
          console.warn('Failed to normalize delegate address from wallet', err);
          setDelegate(self);
        }
      }
      
      // Optionally check if server-side agent is available
      try {
        const r = await fetch('/api/agent/address');
        const j = await r.json();
        if (j?.success && j.address) {
          addLog(`Server-side agent available at ${j.address} (optional for automated execution)`, 'info');
        } else if (j?.error) {
          addLog('Server-side automation not configured - using client-side execution', 'info');
        }
      } catch {}
      
      try {
        const saved = JSON.parse(localStorage.getItem("dca_ui") || "{}");
        if (saved.tokenIn) setTokenIn(saved.tokenIn);
        if (saved.tokenOut) setTokenOut(saved.tokenOut);
        if (saved.budget) setBudget(String(saved.budget));
        if (saved.legs) setLegs(Number(saved.legs));
        if (saved.intervalMins) setIntervalMins(Number(saved.intervalMins));
      } catch {}
    })();
  }, [smartAddress, delegate, eoaAddress, ownerAddress]);

  useEffect(() => {
    const data = { tokenIn, tokenOut, budget, legs, intervalMins };
    try { localStorage.setItem("dca_ui", JSON.stringify(data)); } catch {}
  }, [tokenIn, tokenOut, budget, legs, intervalMins]);

  const [showLegacyInterface, setShowLegacyInterface] = useState(false);
  const [currentStep, setCurrentStep] = useState<'configure' | 'delegate' | 'execute' | 'complete'>('configure');
  const [executingLegIndex, setExecutingLegIndex] = useState<number | null>(null);

  const selectedTokenIn = useMemo(() => {
    const byAddr = tokenInAddr ? tokenList.find(t => t.address.toLowerCase() === tokenInAddr!.toLowerCase()) : undefined;
    return byAddr || tokenList.find(t => t.symbol.toLowerCase() === tokenIn.toLowerCase()) || null;
  }, [tokenList, tokenIn, tokenInAddr]);
  const selectedTokenOut = useMemo(() => {
    const byAddr = tokenOutAddr ? tokenList.find(t => t.address.toLowerCase() === tokenOutAddr!.toLowerCase()) : undefined;
    return byAddr || tokenList.find(t => t.symbol.toLowerCase() === tokenOut.toLowerCase()) || null;
  }, [tokenList, tokenOut, tokenOutAddr]);
  const { formatted: balanceIn } = useBalance((smartAddress as unknown as `0x${string}`) || null, selectedTokenIn);
  const { formatted: balanceOut } = useBalance((smartAddress as unknown as `0x${string}`) || null, selectedTokenOut);

  function swapTokens() {
    const a = tokenIn; const b = tokenOut; const aAddr = tokenInAddr; const bAddr = tokenOutAddr;
    setTokenIn(b); setTokenOut(a); setTokenInAddr(bAddr); setTokenOutAddr(aAddr);
  }

  function quickPick(pair: 'mon-usdc' | 'wmon-usdc') {
    if (pair === 'mon-usdc') { setTokenIn('MON'); setTokenInAddr(null); setTokenOut('USDC'); }
    if (pair === 'wmon-usdc') { setTokenIn('WMON'); setTokenInAddr('0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701'); setTokenOut('USDC'); }
  }

  function setBudgetFraction(frac: number) {
    const bal = parseFloat(balanceIn || '0');
    if (!isFinite(bal) || bal <= 0) return;
    const val = frac >= 1 ? bal : bal * frac;
    setBudget(String(Math.max(0, Math.floor(val * 10000) / 10000)));
  }

  async function executeNextLegClientSide() {
    if (!walletClient || !smartAddress || !permissionContext || permissionContext.length === 0) {
      alert('❌ Delegation not created or wallet not connected');
      return;
    }

    try {
      setBusy(true);
      
      // Find next pending leg (prefer aiPlan if available)
      let nextLeg: { index: number; amount: number } | undefined;
      
      if (aiPlan && aiPlan.length > 0) {
        nextLeg = aiPlan.find(leg => !leg.status || leg.status === 'pending');
      } else if (plan.length > 0) {
        // Use first pending leg from plan
        const completedCount = aiPlan?.filter(l => l.status === 'completed').length || 0;
        nextLeg = plan[completedCount];
      }
      
      if (!nextLeg) {
        addLog('✅ All legs completed!', 'success');
        setCurrentStep('complete');
        return;
      }

      setExecutingLegIndex(nextLeg.index);
      addLog(`🚀 Executing leg ${nextLeg.index}/${aiPlan?.length || plan.length}...`, 'info');
      addLog(`💰 Amount: ${nextLeg.amount.toFixed(4)} ${tokenIn}`, 'info');
      addLog('👛 Please confirm in your wallet...', 'warning');
      
      const amount = parseUnits(String(nextLeg.amount), 18); // Assuming 18 decimals
      
      const result = await executeDelegatedTransaction({
        delegation: permissionContext[0],
        router: router as `0x${string}`,
        amount,
        recipient: smartAddress as `0x${string}`,
        walletClient,
      });

      if (result.success) {
        addLog(`✅ Leg ${nextLeg.index} executed successfully!`, 'success');
        addLog(`📝 Transaction: ${result.txHash}`, 'success');
        
        // Update leg status locally if using aiPlan
        if (aiPlan) {
          const updated = aiPlan.map(l => 
            l.index === nextLeg!.index ? { ...l, status: 'completed' as const, txHash: result.txHash } : l
          );
          setAiPlan(updated);
          
          // Check if all completed
          const allDone = updated.every(l => l.status === 'completed');
          if (allDone) {
            addLog('🎉 All DCA legs completed!', 'success');
            setCurrentStep('complete');
          } else {
            const remaining = updated.filter(l => l.status !== 'completed').length;
            addLog(`📊 ${remaining} legs remaining`, 'info');
          }
        }
      } else {
        throw new Error(result.error || 'Execution failed');
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'execution_failed';
      addLog(`❌ Execution failed: ${err}`, 'error');
      
      // User-friendly error messages
      if (err.includes('User rejected') || err.includes('user rejected')) {
        alert('⚠️ Transaction cancelled by user');
      } else {
        alert(`❌ Execution failed: ${err}`);
      }
    } finally {
      setBusy(false);
      setExecutingLegIndex(null);
    }
  }

  async function oneClickStart() {
    // Robust wallet readiness gate: check wagmi connection OR wallet client addresses
    let hasWallet = isConnected;
    if (!hasWallet && walletClient && typeof (walletClient as { getAddresses?: () => Promise<string[]> }).getAddresses === 'function') {
      try {
        const addrs = await (walletClient as { getAddresses: () => Promise<string[]> }).getAddresses();
        hasWallet = Array.isArray(addrs) && addrs.length > 0;
      } catch {}
    }
    if (!hasWallet) {
      alert('❌ Please connect your wallet first');
      return;
    }
    if (!delegate) {
      alert('❌ Missing delegate address');
      return;
    }
    if (!router) {
      alert('❌ Missing router address');
      return;
    }
    if (!smartAccount || !smartAddress) {
      alert('❌ Smart account is still loading. Please wait a moment and retry.');
      return;
    }
    
    try {
      setBusy(true);
      addLog('📝 Step 2: Creating delegation...', 'info');
      addLog('👛 Please sign in your wallet...', 'warning');
      
      const rec = await createDelegation({
        router: router as `0x${string}`,
        spendCap,
        expiry,
        walletClient, // optional; createDelegation will fallback to window.ethereum
        // Smart account will sign delegations; fall back to owner for legacy flows
        from: (smartAddress || ownerAddress || eoaAddress) as `0x${string}`,
        to: delegate as `0x${string}`,
        smartAccount,
      });
      
      setDelegationId(rec.id);
      setDelegationCreated(true);
      setPermissionContext(rec.permissionContext || null);
      if (rec.resolvedDelegate) {
        setDelegate(rec.resolvedDelegate);
        if (!delegate || rec.resolvedDelegate.toLowerCase() !== delegate.toLowerCase()) {
          addLog(`Delegate normalized to ${rec.resolvedDelegate}`, 'info');
        }
      }
      if (rec.resolvedDelegator) {
        addLog(`Delegator set to ${rec.resolvedDelegator}`, 'info');
      }
      
      addLog(`✅ Delegation created successfully!`, 'success');
      addLog(`🔑 ID: ${rec.id}`, 'info');
      addLog(`📊 Ready to execute ${aiPlan?.length || plan.length} legs`, 'info');
      addLog(`🚀 Step 3: Click "Execute Next Leg" when ready`, 'info');
      
      setCurrentStep('execute');
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'delegation_failed';
      addLog(`❌ Delegation failed: ${err}`, 'error');
      
      if (err.includes('User rejected') || err.includes('user rejected')) {
        alert('⚠️ Delegation cancelled by user');
      } else {
        alert(`❌ Delegation failed: ${err}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] p-6 sm:p-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="text-2xl sm:text-3xl font-semibold text-black">DCA Sitter</div>
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
        {/* Progress Steps Indicator */}
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 p-6">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-3 ${currentStep === 'configure' ? 'opacity-100' : 'opacity-50'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${currentStep === 'configure' ? 'bg-blue-600 animate-pulse' : 'bg-gray-400'}`}>
                1
              </div>
              <div>
                <div className="font-semibold">Configure</div>
                <div className="text-xs text-gray-600">Set up DCA params</div>
              </div>
            </div>
            
            <div className="flex-1 mx-4 h-1 bg-gray-300 rounded">
              <div className={`h-full bg-blue-600 rounded transition-all duration-500 ${currentStep === 'configure' ? 'w-0' : currentStep === 'execute' || currentStep === 'complete' ? 'w-full' : 'w-1/2'}`}></div>
            </div>
            
            <div className={`flex items-center gap-3 ${currentStep === 'execute' ? 'opacity-100' : 'opacity-50'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${currentStep === 'execute' ? 'bg-green-600 animate-pulse' : currentStep === 'complete' ? 'bg-green-600' : 'bg-gray-400'}`}>
                2
              </div>
              <div>
                <div className="font-semibold">Execute</div>
                <div className="text-xs text-gray-600">Run DCA legs</div>
              </div>
            </div>
            
            <div className="flex-1 mx-4 h-1 bg-gray-300 rounded">
              <div className={`h-full bg-green-600 rounded transition-all duration-500 ${currentStep === 'complete' ? 'w-full' : 'w-0'}`}></div>
            </div>
            
            <div className={`flex items-center gap-3 ${currentStep === 'complete' ? 'opacity-100' : 'opacity-50'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${currentStep === 'complete' ? 'bg-purple-600' : 'bg-gray-400'}`}>
                ✓
              </div>
              <div>
                <div className="font-semibold">Complete</div>
                <div className="text-xs text-gray-600">All done!</div>
              </div>
            </div>
          </div>
          
          {/* Current step instruction */}
          <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200">
            {currentStep === 'configure' && (
              <p className="text-sm"><span className="font-bold">📝 Step 1:</span> Configure your DCA strategy, then click "One-Click Start" to create delegation</p>
            )}
            {currentStep === 'execute' && (
              <p className="text-sm"><span className="font-bold">🚀 Step 2:</span> Click "Execute Next Leg" to run each leg (you'll be prompted to sign each transaction)</p>
            )}
            {currentStep === 'complete' && (
              <p className="text-sm"><span className="font-bold">🎉 Complete:</span> All DCA legs executed successfully! Check the activity log for transaction details.</p>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-[var(--surface)] text-black p-6">
            <div className="text-lg font-medium mb-4">DCA Configuration</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm">Token In</label>
                <TokenSelector
                  selectedSymbol={tokenIn}
                  selectedAddress={tokenInAddr ?? undefined}
                  onSelect={(t) => { setTokenIn(t.symbol); setTokenInAddr(t.address === "native" ? null : t.address); }}
                />
                <div className="text-xs text-gray-600">Balance: {Number.isFinite(parseFloat(balanceIn)) ? parseFloat(balanceIn).toFixed(4) : balanceIn} {tokenIn}</div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm">Token Out</label>
                <TokenSelector
                  selectedSymbol={tokenOut}
                  selectedAddress={tokenOutAddr ?? undefined}
                  onSelect={(t) => { setTokenOut(t.symbol); setTokenOutAddr(t.address === "native" ? null : t.address); }}
                />
                <div className="text-xs text-gray-600">Balance: {Number.isFinite(parseFloat(balanceOut)) ? parseFloat(balanceOut).toFixed(4) : balanceOut} {tokenOut}</div>
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <Button onClick={swapTokens} className="px-3 py-1 text-sm">⇄ Swap</Button>
                <div className="text-xs text-gray-600">Quick pairs:</div>
                <Button onClick={() => quickPick('mon-usdc')} className="px-3 py-1 text-xs">MON ↔ USDC</Button>
                <Button onClick={() => quickPick('wmon-usdc')} className="px-3 py-1 text-xs">WMON ↔ USDC</Button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm">Total Budget</label>
                <input type="number" min={0} className="rounded-lg px-3 py-2 bg-white border border-black/10" value={budget} onChange={(e) => setBudget(e.target.value)} />
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>Quick set:</span>
                  <Button onClick={() => setBudgetFraction(0.25)} className="px-2 py-0.5 text-xs">25%</Button>
                  <Button onClick={() => setBudgetFraction(0.5)} className="px-2 py-0.5 text-xs">50%</Button>
                  <Button onClick={() => setBudgetFraction(1)} className="px-2 py-0.5 text-xs">MAX</Button>
                </div>
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
            <div className="text-lg font-medium mb-2">Delegation Settings</div>
            <p className="text-xs text-gray-600 mb-4">✅ Using self-delegation for maximum security</p>
            
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  Delegate Address 
                  <span className="text-xs text-green-600 font-normal">(You - Recommended)</span>
                </label>
                <input 
                  className="rounded-lg px-3 py-2 bg-gray-50 border border-black/10 font-mono text-sm" 
                  placeholder="0x..." 
                  value={delegate} 
                  onChange={(e) => setDelegate(e.target.value)}
                />
                <p className="text-xs text-gray-500">You'll execute transactions from your own wallet</p>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">DCA Router Address</label>
                <input 
                  className="rounded-lg px-3 py-2 bg-gray-50 border border-black/10 font-mono text-sm" 
                  placeholder="0x..." 
                  value={router} 
                  onChange={(e) => setRouter(e.target.value)} 
                />
                <p className="text-xs text-gray-500">Contract authorized to execute your DCA strategy</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Spend Cap (MON)</label>
                  <input 
                    type="number" 
                    min={0} 
                    className="rounded-lg px-3 py-2 bg-white border border-black/10" 
                    value={spendCap} 
                    onChange={(e) => setSpendCap(e.target.value)} 
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Expiry</label>
                  <input 
                    type="datetime-local" 
                    className="rounded-lg px-3 py-2 bg-white border border-black/10 text-xs" 
                    value={expiry} 
                    onChange={(e) => setExpiry(e.target.value)} 
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {!delegationCreated ? (
                  <Button 
                    onClick={oneClickStart} 
                    disabled={busy || !isConnected || !router || !delegate || !budget || parseFloat(budget) <= 0} 
                    className="w-full py-3 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                  >
                    {busy ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                        Creating Delegation...
                      </span>
                    ) : (
                      "🚀 One-Click Start"
                    )}
                  </Button>
                ) : (
                  <div className="w-full py-3 px-4 bg-green-100 border-2 border-green-500 rounded-lg text-center">
                    <div className="text-green-800 font-semibold">✅ Delegation Created</div>
                    <div className="text-xs text-green-600 mt-1">Ready to execute legs below</div>
                  </div>
                )}

                {delegationCreated && currentStep !== 'complete' && (
                  <Button 
                    onClick={executeNextLegClientSide} 
                    disabled={busy || !permissionContext} 
                    className={`px-6 py-3 text-sm font-semibold ${
                      busy ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700 animate-pulse'
                    } text-white shadow-lg`}
                  >
                    {busy ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                        Executing Leg {executingLegIndex}...
                      </span>
                    ) : (
                      <span>🚀 Execute Next Leg ({(aiPlan?.filter(l => l.status !== 'completed').length || plan.length)}/{aiPlan?.length || plan.length})</span>
                    )}
                  </Button>
                )}
                
                {currentStep === 'complete' && (
                  <>
                    <div className="px-6 py-3 bg-gradient-to-r from-green-500 to-purple-500 text-white rounded-lg text-center font-semibold shadow-lg">
                      🎉 All Legs Completed!
                    </div>
                    <Button
                      onClick={() => {
                        // Reset for new DCA
                        setDelegationCreated(false);
                        setDelegationId(null);
                        setPermissionContext(null);
                        setAiPlan(null);
                        setExecutionId(null);
                        setCurrentStep('configure');
                        addLog('🔄 Ready to start a new DCA', 'info');
                      }}
                      className="w-full py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      🔄 Start New DCA
                    </Button>
                  </>
                )}

                {delegationCreated && currentStep !== 'complete' && (
                  <Button
                    onClick={async () => {
                      if (!delegationId) return;
                      const confirmed = confirm('⚠️ Are you sure you want to revoke the delegation? This will stop all pending executions.');
                      if (!confirmed) return;
                      
                      try {
                        setBusy(true);
                        addLog("🔴 Revoking delegation...", 'warning');

                        await revokeDelegation();

                        setPermissionContext(null);
                        setDelegationCreated(false);
                        setDelegationId(null);
                        setExecutionId(null);
                        setExecutionStatus(null);
                        setAgentStatus(null);
                        setCurrentStep('configure');

                        addLog("✅ Delegation revoked", 'success');
                        addLog("📊 You can create a new delegation", 'info');

                      } catch (error: unknown) {
                        const err = error instanceof Error ? error.message : 'Revocation failed';
                        addLog(`❌ Revocation failed: ${err}`, 'error');
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                    className="w-full py-2 text-sm bg-red-600 hover:bg-red-700 text-white"
                  >
                    {busy ? "Revoking…" : "🗑️ Revoke Delegation"}
                  </Button>
                )}
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

        {currentStep === 'complete' && (
          <Card className="bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 text-white p-8 text-center">
            <div className="text-4xl mb-3">🎊 🎉 Congratulations! 🎉 🎊</div>
            <div className="text-2xl font-bold mb-2">All DCA Legs Executed Successfully!</div>
            <div className="text-sm opacity-90">Your dollar-cost averaging strategy has been completed on Monad testnet</div>
            {aiPlan && (
              <div className="mt-4 flex justify-center gap-6 text-sm">
                <div className="bg-white/20 rounded-lg px-4 py-2">
                  <div className="font-semibold">{aiPlan.length}</div>
                  <div className="opacity-90">Legs Completed</div>
                </div>
                <div className="bg-white/20 rounded-lg px-4 py-2">
                  <div className="font-semibold">{budget} {tokenIn}</div>
                  <div className="opacity-90">Total Invested</div>
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

        {/* Envio panel removed */}

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
