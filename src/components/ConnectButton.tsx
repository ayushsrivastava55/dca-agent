"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function truncate(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, status } = useConnect();
  const { disconnect } = useDisconnect();

  const isConnecting = status === "pending";
  const preferredConnector = connectors.find((c) => c.id === "metaMask");
  const readyConnector = connectors.find((c) => c.ready);
  const fallbackConnector = connectors[0];
  const connector = preferredConnector ?? readyConnector ?? fallbackConnector;

  if (isConnected) {
    return (
      <div className="flex items-center gap-3">
        <div
          className="rounded-full text-white px-4 py-2 text-sm font-medium shadow-sm"
          style={{ background: 'linear-gradient(90deg, #3b82f6 0%, #6366f1 100%)' }}
        >
          {truncate(address)}
        </div>
        <button
          type="button"
          className="rounded-full px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:shadow-md"
          style={{ background: 'linear-gradient(90deg, #f43f5e 0%, #e11d48 100%)' }}
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="rounded-full text-white px-5 py-2 text-sm font-medium shadow-sm transition hover:shadow-md disabled:opacity-60 disabled:hover:shadow-none"
      style={{ background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)' }}
      onClick={() => connector && connect({ connector })}
      disabled={!connector || isConnecting}
    >
      {isConnecting ? "Connecting…" : connector ? `Connect ${connector.name}` : "No Wallet Found"}
    </button>
  );
}
