"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function truncate(addr?: string) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, status } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-[var(--color-primary)] text-white px-4 py-2 text-sm">{truncate(address)}</div>
        <button
          className="rounded-full border border-white/20 hover:bg-white/10 px-4 py-2 text-sm"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  const injected = connectors[0];

  return (
    <button
      className="rounded-full bg-[var(--color-primary)] text-white px-5 py-2 text-sm font-medium hover:opacity-90"
      onClick={() => connect({ connector: injected })}
      disabled={status === "pending"}
    >
      {status === "pending" ? "Connecting…" : "Connect MetaMask"}
    </button>
  );
}
