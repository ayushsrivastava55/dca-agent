import { monadTestnet } from "@/lib/chains";
import { parseUnits } from "viem";

// Cache for deployed DTK environment
let _monadEnvironment: any = null;
let _environmentInitialized = false;
 

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

async function getEnvironment(dtk: any, chainId: number) {
  // For Monad testnet, ALWAYS prioritize env vars over any DTK built-in
  if (chainId === monadTestnet.id) {
    if (_monadEnvironment) {
      return _monadEnvironment;
    }

    if (!_environmentInitialized) {
      _environmentInitialized = true;
      const delegationManager = process.env.NEXT_PUBLIC_DTK_DELEGATION_MANAGER;
      const implementation = process.env.NEXT_PUBLIC_DTK_IMPLEMENTATION;

      if (delegationManager && implementation) {
        console.log('[DTK] Using pre-deployed contracts from env');
        
        // Build environment with caveat enforcers (match DTK's expected structure)
        _monadEnvironment = {
          DelegationManager: delegationManager,
          implementations: {
            Hybrid: implementation,
            HybridDeleGatorImpl: implementation,
          },
          caveatEnforcers: {
            NativeTokenTransferAmountEnforcer: process.env.NEXT_PUBLIC_DTK_NATIVE_TOKEN_ENFORCER || '',
            ExactCalldataEnforcer: process.env.NEXT_PUBLIC_DTK_EXACT_CALLDATA_ENFORCER || '',
            AllowedTargetsEnforcer: process.env.NEXT_PUBLIC_DTK_ALLOWED_TARGETS_ENFORCER || '',
            TimestampEnforcer: process.env.NEXT_PUBLIC_DTK_TIMESTAMP_ENFORCER || '',
          },
        };
        // Register it with DTK
        try {
          const { overrideDeployedEnvironment } = await import('@metamask/delegation-toolkit/utils');
          overrideDeployedEnvironment(chainId, '1.3.0', _monadEnvironment);
        } catch {}
        return _monadEnvironment;
      } else {
        console.warn('[DTK] No Delegation Framework found for Monad testnet.');
        console.warn('[DTK] Run: npx tsx scripts/deploy-dtk.ts to deploy contracts.');
        console.warn('[DTK] Or add NEXT_PUBLIC_DTK_DELEGATION_MANAGER and NEXT_PUBLIC_DTK_IMPLEMENTATION to .env.local');
      }
    }
  }

  // For other chains, use DTK's built-in environments
  return dtk.getDelegatorEnvironment?.(chainId) || dtk.getDeleGatorEnvironment?.(chainId) || null;
}

export async function createDelegation(params: DelegationParams): Promise<DelegationReceipt> {
  const { walletClient, from, to, spendCap } = params;
  const chainId = monadTestnet.id;
  const dtk = await import("@metamask/delegation-toolkit");

  if (!walletClient) throw new Error("wallet_client_missing");
  if (!from || !from.startsWith("0x")) throw new Error("from_address_invalid");
  if (!to || !to.startsWith("0x")) throw new Error("to_address_invalid");
  if (!params.router || typeof params.router !== "string" || !params.router.startsWith("0x")) {
    throw new Error("router_address_invalid");
  }

  const environment = await getEnvironment(dtk as any, chainId);
  console.log('[DTK] Environment loaded:', environment);
  if (!environment) throw new Error("Delegation environment not available on this chain");

  const delegationManager =
    (environment as any).DelegationManager ||
    (environment as any).delegationManager ||
    (environment as any).delegationManagerAddress;
  console.log('[DTK] Extracted DelegationManager:', delegationManager);
  if (!delegationManager || typeof delegationManager !== "string" || !delegationManager.startsWith("0x")) {
    console.error('[DTK] DelegationManager validation failed:', { delegationManager, type: typeof delegationManager });
    throw new Error("delegation_manager_missing");
  }

  // Create delegation with spend cap scope
  console.log('[DTK] Creating delegation with nativeTokenTransferAmount scope');
  const maxAmount = parseUnits(spendCap || "100", 18); // Default 100 MON if not specified
  
  const d = (dtk as any).createDelegation({
    from,
    to,
    environment,
    scope: {
      type: "nativeTokenTransferAmount",
      maxAmount,
    },
    caveats: [],
  });

  let signerAddr = walletClient?.account?.address as `0x${string}` | undefined;
  if (!signerAddr && typeof walletClient?.getAddresses === "function") {
    const addrs = await walletClient.getAddresses();
    signerAddr = addrs?.[0] as `0x${string}` | undefined;
  }
  if (!signerAddr || !signerAddr.startsWith("0x")) throw new Error("signer_account_missing");

  // Inject expected account shape onto the walletClient so DTK can read signer.account.address
  try {
    (walletClient as any).account = { address: signerAddr, type: "json-rpc" } as any;
  } catch {}

  // Debug logging
  console.log('[DTK] WalletClient details:', {
    hasAccount: !!walletClient?.account,
    accountAddress: walletClient?.account?.address,
    accountType: walletClient?.account?.type,
    signerAddr,
    chainId: walletClient?.chain?.id,
  });

  console.log('[DTK] Delegation object:', {
    delegate: d?.delegate,
    delegator: d?.delegator,
    authority: d?.authority,
    hasCaveats: !!d?.caveats,
    hasScope: !!d?.scope,
  });

  console.log('[DTK] Attempting signDelegation with:', {
    delegation: d,
    chainId,
    chainIdType: typeof chainId,
    delegationManager,
    delegationManagerType: typeof delegationManager,
    signerAddr,
    hasWalletClient: !!walletClient,
    walletClientType: typeof walletClient,
  });

  // Validate all required fields
  if (!d) throw new Error('delegation_object_missing');
  if (!chainId || typeof chainId !== 'number') throw new Error('chainId_invalid');
  if (!delegationManager || typeof delegationManager !== 'string' || !delegationManager.startsWith('0x')) {
    throw new Error('delegationManager_invalid');
  }

  let signature: string | undefined;
  try {
    // Try standard pattern: signer is walletClient with account property
    signature = await (dtk as any).signDelegation({
      signer: walletClient,
      delegation: d,
      chainId,
      delegationManager,
      name: "DelegationManager",
      version: "1",
    });
    console.log('[DTK] Signature obtained:', signature?.slice(0, 20) + '...');
  } catch (e: any) {
    console.error('[DTK] signDelegation failed:', e);
    const msg = e?.message || String(e);
    throw new Error(`sign_delegation_failed: ${msg}`);
  }

  return { id: `dlg_${Date.now()}`, signature, raw: d };
}

export async function revokeDelegation(_id: string): Promise<void> {
  // TODO: integrate disableDelegation with DTK when persisting delegation metadata
  await new Promise((r) => setTimeout(r, 200));
}
