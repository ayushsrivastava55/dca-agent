"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import ConnectButton from "@/components/ConnectButton";
import NetworkStatus from "@/components/NetworkStatus";
import { createDelegation, revokeDelegation } from "@/lib/delegation";

export default function Home() {
  const { isConnected } = useAccount();
  const [tokenIn, setTokenIn] = useState("MON");
  const [tokenOut, setTokenOut] = useState("USDC");
  const [budget, setBudget] = useState("100");
  const [legs, setLegs] = useState(4);
  const [intervalMins, setIntervalMins] = useState(60);
  const [router, setRouter] = useState("");
  const [spendCap, setSpendCap] = useState("100");
  const [expiry, setExpiry] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [delegationCreated, setDelegationCreated] = useState(false);
  const [delegationId, setDelegationId] = useState<string | null>(null);
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

  return (
    <div className="min-h-screen p-6 sm:p-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div className="text-2xl sm:text-3xl font-semibold">DCA Sitter</div>
          <div className="flex items-center gap-3">
            <NetworkStatus />
            <ConnectButton />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 rounded-2xl bg-[var(--surface)] text-black p-6">
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
            </div>
          </section>

          <section className="rounded-2xl bg-[var(--surface)] text-black p-6">
            <div className="text-lg font-medium mb-4">Delegation</div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm">DCA Router Address</label>
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
                <button
                  className="rounded-full bg-[var(--color-primary)] text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
                  onClick={async () => {
                    try {
                      setBusy(true);
                      const rec = await createDelegation({ router, spendCap, expiry });
                      setDelegationId(rec.id);
                      setDelegationCreated(true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={!isConnected || !router || busy}
                >
                  {busy ? "Creating…" : "Create Delegation"}
                </button>
                <button
                  className="rounded-full bg-[var(--color-error)] text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
                  onClick={async () => {
                    if (!delegationId) return;
                    try {
                      setBusy(true);
                      await revokeDelegation(delegationId);
                      setDelegationCreated(false);
                      setDelegationId(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={!delegationCreated || busy}
                >
                  {busy ? "Revoking…" : "Revoke"}
                </button>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-2xl bg-[var(--surface)] text-black p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-lg font-medium">Execution Timeline</div>
            <div className="text-sm">{delegationCreated ? "Active" : "Inactive"}</div>
          </div>
          <div className="space-y-2">
            {plan.length === 0 ? (
              <div className="text-sm">No plan generated</div>
            ) : (
              plan.map((p) => (
                <div key={p.index} className="flex items-center justify-between rounded-lg bg-white p-3 border border-black/10">
                  <div className="text-sm">Leg {p.index}</div>
                  <div className="text-sm">{p.amount.toFixed(4)} {tokenIn}</div>
                  <div className="text-sm">{p.at.toLocaleString()}</div>
                  <div className="text-xs px-2 py-1 rounded-full bg-black/5">Pending</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 p-6">
          <div className="text-sm mb-2">Monad Testnet</div>
          <div className="flex gap-3 text-sm">
            <a className="underline" href="https://faucet.monad.xyz/" target="_blank" rel="noreferrer">Faucet</a>
            <a className="underline" href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer">Explorer</a>
            <a className="underline" href="https://docs.monad.xyz/" target="_blank" rel="noreferrer">Docs</a>
          </div>
        </section>
      </div>
    </div>
  );
}
