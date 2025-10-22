"use client";

import { useSmartAccount } from "@/hooks/useSmartAccount";

export default function SmartAccountStatus() {
  const { ready, ownerAddress, loading, error } = useSmartAccount();

  if (loading) return <div className="text-xs">Setting up smart account…</div>;
  if (error) return <div className="text-xs text-[var(--color-error)]">{error}</div>;
  if (!ready) return null;

  return (
    <div className="text-xs rounded-full border border-white/20 px-3 py-1">
      SA ready · Owner {ownerAddress?.slice(0, 6)}…{ownerAddress?.slice(-4)}
    </div>
  );
}
