"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { monadTestnet } from "@/lib/chains";

export default function NetworkStatus() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  const isOnMonad = chainId === monadTestnet.id;

  if (!isConnected) return null;
  if (isOnMonad) {
    return (
      <div className="text-xs rounded-full border border-black/20 px-3 py-1 text-black bg-green-50">Monad Testnet</div>
    );
  }

  return (
    <button
      className="text-xs rounded-full bg-[var(--color-error)] text-white px-3 py-1 disabled:opacity-50"
      onClick={() => switchChain({ chainId: monadTestnet.id })}
      disabled={isPending}
    >
      {isPending ? "Switching…" : "Switch to Monad"}
    </button>
  );
}
