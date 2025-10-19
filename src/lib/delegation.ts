import { monadTestnet } from "@/lib/chains";
import { parseUnits } from "viem";

export type DelegationParams = {
  router: `0x${string}` | string;
  spendCap: string; // human units
  expiry: string; // ISO string (not yet enforced here)
  walletClient: any; // viem wallet client
  from: `0x${string}`; // smart account (delegator)
  to: `0x${string}`; // delegate address (agent)
};

export type DelegationReceipt = {
  id: string;
  signature?: string;
  raw?: any;
};

function getEnvironment(dtk: any, chainId: number) {
  // Try both spellings due to docs variations
  return (
    dtk.getDelegatorEnvironment?.(chainId) ||
    dtk.getDeleGatorEnvironment?.(chainId) ||
    null
  );
}

export async function createDelegation(params: DelegationParams): Promise<DelegationReceipt> {
  const { walletClient, from, to, spendCap } = params;
  const chainId = monadTestnet.id;
  const dtk = await import("@metamask/delegation-toolkit");

  const environment = getEnvironment(dtk as any, chainId);
  if (!environment) throw new Error("Delegation environment not available on this chain");

  // Spend cap as native token limit (placeholder). Adjust to USDC with proper decimals when token config is known.
  const maxAmount = parseUnits(spendCap || "0", 18);
  const scope = { type: "nativeTokenTransferAmount", maxAmount } as any;

  // Build delegation
  const d = (dtk as any).createDelegation({
    from,
    to,
    environment,
    scope,
  });

  // Sign delegation
  const signature = await (dtk as any).signDelegation({
    signer: walletClient,
    delegation: d,
    chainId,
    delegationManager: environment.DelegationManager,
  });

  return { id: `dlg_${Date.now()}`, signature, raw: d };
}

export async function revokeDelegation(_id: string): Promise<void> {
  // TODO: integrate disableDelegation with DTK when persisting delegation metadata
  await new Promise((r) => setTimeout(r, 200));
}
