import { useEffect, useState } from "react";
import { createPublicClient, http, formatUnits } from "viem";
import { monadTestnet } from "@/lib/chains";
import type { TokenInfo } from "@/lib/tokenlist";

const erc20 = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "balance", type: "uint256" }] }] as const;

export function useBalance(account?: `0x${string}` | null, token?: TokenInfo | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<bigint | null>(null);
  const [formatted, setFormatted] = useState<string>("0");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!account || !token) return;
      try {
        setLoading(true);
        setError(null);
        const client = createPublicClient({ chain: monadTestnet, transport: http() });
        let bal: bigint;
        if (token.isNative || token.address === "native") {
          bal = await client.getBalance({ address: account });
        } else if (token.address && token.address.startsWith("0x")) {
          bal = await client.readContract({ address: token.address as `0x${string}`, abi: erc20, functionName: "balanceOf", args: [account] }) as unknown as bigint;
        } else {
          bal = BigInt(0);
        }
        if (cancelled) return;
        setValue(bal);
        setFormatted(formatUnits(bal, token.decimals ?? 18));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "balance_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [account, token]);

  return { loading, error, value, formatted };
}
