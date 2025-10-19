"use client";

import { useEffect, useMemo, useState } from "react";
import { useWalletClient } from "wagmi";
import { publicClient } from "@/lib/viem";
import { Implementation, toMetaMaskSmartAccount } from "@metamask/delegation-toolkit";

export function useSmartAccount() {
  const { data: walletClient } = useWalletClient();
  const [smartAccount, setSmartAccount] = useState<any | null>(null);
  const [smartAddress, setSmartAddress] = useState<`0x${string}` | null>(null);
  const [owner, setOwner] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!walletClient) return;
      try {
        setLoading(true);
        const addrs = await walletClient.getAddresses();
        const ownerAddr = addrs[0];
        const sa = await toMetaMaskSmartAccount({
          client: publicClient,
          implementation: Implementation.Hybrid,
          deployParams: [ownerAddr, [], [], []],
          deploySalt: "0x",
          signer: { walletClient },
        });
        if (!cancelled) {
          setSmartAccount(sa);
          setOwner(ownerAddr);
          // Address property presence depends on toolkit version; guard access.
          const addr = (sa as any)?.address as `0x${string}` | undefined;
          if (addr) setSmartAddress(addr);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [walletClient]);

  const ready = useMemo(() => Boolean(smartAccount && owner), [smartAccount, owner]);
  return { smartAccount, smartAddress, ownerAddress: owner, ready, error, loading } as const;
}
