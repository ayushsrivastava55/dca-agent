import { monadTestnet } from "@/lib/chains";
import { createWalletClient, custom, concat, encodePacked, parseUnits, toFunctionSelector } from "viem";
import { createTimestampTerms } from "@metamask/delegation-core";
import type { Delegation } from "@metamask/delegation-toolkit";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

export type DelegationParams = {
  router?: `0x${string}` | string;
  spendCap: string;
  expiry: string;
  walletClient: unknown;
  from: `0x${string}`;
  to: `0x${string}`;
};

export type DelegationReceipt = {
  id: string;
  signature?: string;
  raw?: unknown;
  permissionContext?: Delegation[];
};

export async function createDelegation(params: DelegationParams): Promise<DelegationReceipt> {
  const { walletClient, from, to } = params;

  if (!walletClient) throw new Error("wallet_client_missing");
  if (!from || !from.startsWith("0x")) throw new Error("from_address_invalid");
  if (!to || !to.startsWith("0x")) throw new Error("to_address_invalid");

  // Use provided router or default to DCA Router from environment
  const router = params.router || process.env.NEXT_PUBLIC_DCA_ROUTER_ADDRESS;
  if (!router || typeof router !== "string" || !router.startsWith("0x")) {
    throw new Error("router_address_invalid_or_missing");
  }
  console.log('[DTK] Using DCA Router:', router);

  // Import DTK with static imports to avoid build hanging
  const { signDelegation } = await import("@metamask/delegation-toolkit/actions");
  const { ROOT_AUTHORITY } = await import("@metamask/delegation-toolkit");

  // Build environment from env vars
  const delegationManager = process.env.NEXT_PUBLIC_DTK_DELEGATION_MANAGER;

  if (!delegationManager) {
    throw new Error("delegation_manager_missing");
  }

  console.log('[DTK] Environment loaded with DelegationManager:', delegationManager);

  // Get signer address
  let signerAddr = (walletClient as { account?: { address?: string } })?.account?.address as `0x${string}` | undefined;
  if (!signerAddr && typeof (walletClient as { getAddresses?: () => Promise<string[]> })?.getAddresses === "function") {
    const addrs = await (walletClient as { getAddresses: () => Promise<string[]> }).getAddresses();
    signerAddr = addrs?.[0] as `0x${string}` | undefined;
  }
  if (!signerAddr || !signerAddr.startsWith("0x")) {
    throw new Error("signer_account_missing");
  }

  // Create wallet client for signing
  if (typeof window === 'undefined' || !(window as { ethereum?: EthereumProvider }).ethereum) {
    throw new Error('no_ethereum_provider');
  }

  const viemWalletClient = createWalletClient({
    account: signerAddr as `0x${string}`,
    chain: monadTestnet,
    transport: custom((window as { ethereum: EthereumProvider }).ethereum),
  });

  console.log('[DTK] Created wallet client for signing');

  // Create delegation object manually with proper structure
  const allowedTargetsEnforcer = process.env.NEXT_PUBLIC_DTK_ALLOWED_TARGETS_ENFORCER;
  if (!allowedTargetsEnforcer) {
    throw new Error("allowed_targets_enforcer_missing");
  }
  const nativeAmountEnforcer = process.env.NEXT_PUBLIC_DTK_NATIVE_TOKEN_ENFORCER;
  if (!nativeAmountEnforcer) {
    throw new Error("native_amount_enforcer_missing");
  }
  const timestampEnforcer = process.env.NEXT_PUBLIC_DTK_TIMESTAMP_ENFORCER;
  if (!timestampEnforcer) {
    throw new Error("timestamp_enforcer_missing");
  }

  // Encode the allowed targets (router address) as terms: concat of addresses per DTK builder
  const encodedTargets = concat([router as `0x${string}`]);

  // Encode spend cap as uint256 per NativeTokenTransferAmountEnforcer
  const maxAmount = parseUnits(params.spendCap || "0", 18);
  const encodedMaxAmount = encodePacked(['uint256'], [maxAmount]);

  // Encode expiry as timestamp caveat (beforeThreshold)
  const beforeThresholdSec = Math.floor(new Date(params.expiry).getTime() / 1000);
  const timestampTerms = createTimestampTerms({
    timestampAfterThreshold: 0,
    timestampBeforeThreshold: beforeThresholdSec,
  });

  const delegation = {
    delegate: to,
    delegator: from,
    authority: ROOT_AUTHORITY as `0x${string}`,
    caveats: [
      {
        enforcer: allowedTargetsEnforcer as `0x${string}`,
        terms: encodedTargets,
        args: '0x' as `0x${string}`, // No additional args needed
      },
      {
        enforcer: nativeAmountEnforcer as `0x${string}`,
        terms: encodedMaxAmount,
        args: '0x' as `0x${string}`,
      },
      {
        enforcer: timestampEnforcer as `0x${string}`,
        terms: timestampTerms as `0x${string}`,
        args: '0x' as `0x${string}`,
      },
    ],
    salt: `0x${Date.now().toString(16).padStart(64, '0')}` as `0x${string}`, // Unique salt
  };

  // Optional: function-level restriction if AllowedMethodsEnforcer is available
  const allowedMethodsEnforcer = process.env.NEXT_PUBLIC_DTK_ALLOWED_METHODS_ENFORCER as `0x${string}` | undefined;
  if (allowedMethodsEnforcer) {
    try {
      const selector = toFunctionSelector('executeLeg(uint256,address)') as `0x${string}`;
      const caveatsArr = delegation.caveats as { enforcer: `0x${string}`; terms: `0x${string}`; args: `0x${string}` }[];
      caveatsArr.splice(1, 0, {
        enforcer: allowedMethodsEnforcer,
        terms: concat([selector]),
        args: '0x' as `0x${string}`,
      });
    } catch (e) {
      console.warn('[DTK] Failed to add AllowedMethods caveat:', e);
    }
  } else {
    console.warn('[DTK] AllowedMethodsEnforcer not configured; skipping function-level restriction');
  }

  console.log('[DTK] Delegation object created:', {
    delegate: delegation.delegate,
    delegator: delegation.delegator,
    authority: delegation.authority,
    caveatsCount: delegation.caveats.length,
    salt: delegation.salt,
  });

  // Sign the delegation
  try {
    console.log('[DTK] Calling signDelegation...');

    const signature = await signDelegation(viemWalletClient, {
      delegation,
      delegationManager: delegationManager as `0x${string}`,
      chainId: monadTestnet.id,
      name: "DelegationManager",
      version: "1",
    });

    console.log('[DTK] Signature obtained:', signature.slice(0, 20) + '...');

    const signedDelegation = { ...delegation, signature } as const;

    return {
      id: `dlg_${Date.now()}`,
      signature,
      raw: signedDelegation,
      permissionContext: [signedDelegation]
    };
  } catch (signError: unknown) {
    console.error('[DTK] Signing failed:', signError);
    const errorMessage = signError instanceof Error ? signError.message : String(signError);
    throw new Error(`sign_delegation_failed: ${errorMessage}`);
  }
}

export async function revokeDelegation(): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
}