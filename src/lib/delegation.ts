import { monadTestnet } from "@/lib/chains";
import { createWalletClient, custom, concat, encodePacked, parseUnits, toFunctionSelector, getAddress } from "viem";
import { createTimestampTerms } from "@metamask/delegation-core";
import type { Delegation } from "@metamask/delegation-toolkit";

type SmartAccountLike = {
  address?: `0x${string}`;
  signDelegation?: (params: { delegation: Omit<Delegation, "signature">; chainId?: number }) => Promise<`0x${string}`>;
};

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

export type DelegationParams = {
  router?: `0x${string}` | string;
  spendCap: string;
  expiry: string;
  walletClient?: unknown;
  from: `0x${string}`;
  to?: `0x${string}` | string;
  smartAccount?: SmartAccountLike | null;
};

export type DelegationReceipt = {
  id: string;
  signature?: string;
  raw?: unknown;
  permissionContext?: Delegation[];
  resolvedDelegate?: `0x${string}`;
  resolvedDelegator?: `0x${string}`;
};

export async function createDelegation(params: DelegationParams): Promise<DelegationReceipt> {
  const { walletClient, from, to, smartAccount } = params;
  if (!from || !from.startsWith("0x")) throw new Error("from_address_invalid");

  const smartAccountAddress = smartAccount?.address;
  let delegatorAddress: `0x${string}`;
  if (smartAccountAddress) {
    try {
      delegatorAddress = getAddress(smartAccountAddress);
    } catch {
      throw new Error("smart_account_address_invalid");
    }
  } else {
    try {
      delegatorAddress = getAddress(from);
    } catch {
      throw new Error("from_address_invalid_checksum");
    }
  }

  // Use provided router or default to DCA Router from environment
  const router = params.router || process.env.NEXT_PUBLIC_DCA_ROUTER_ADDRESS;
  if (!router || typeof router !== "string" || !router.startsWith("0x")) {
    throw new Error("router_address_invalid_or_missing");
  }
  let routerAddress: `0x${string}`;
  try {
    routerAddress = getAddress(router as `0x${string}`);
  } catch {
    throw new Error("router_address_invalid_checksum");
  }

  console.log('[DTK] Using DCA Router:', routerAddress);

  // Import DTK with static imports to avoid build hanging
  const { signDelegation } = await import("@metamask/delegation-toolkit/actions");
  const { ROOT_AUTHORITY } = await import("@metamask/delegation-toolkit");

  // Build environment from env vars
  const delegationManager = process.env.NEXT_PUBLIC_DTK_DELEGATION_MANAGER;

  if (!delegationManager) {
    throw new Error("delegation_manager_missing");
  }

  console.log('[DTK] Environment loaded with DelegationManager:', delegationManager);

  // Get signer address (robust): prefer provided walletClient, else read from window.ethereum
  let signerAddr = (walletClient as { account?: { address?: string } })?.account?.address as `0x${string}` | undefined;
  if (!signerAddr && walletClient && typeof (walletClient as { getAddresses?: () => Promise<string[]> })?.getAddresses === "function") {
    const addrs = await (walletClient as { getAddresses: () => Promise<string[]> }).getAddresses();
    signerAddr = addrs?.[0] as `0x${string}` | undefined;
  }
  if (!signerAddr) {
    const eth = (typeof window !== 'undefined' ? (window as { ethereum?: EthereumProvider }).ethereum : undefined);
    if (eth) {
      const addrs = (await eth.request({ method: 'eth_accounts' }) as string[]) || [];
      if (addrs.length === 0) {
        const req = (await eth.request({ method: 'eth_requestAccounts' }) as string[]) || [];
        signerAddr = req?.[0] as `0x${string}` | undefined;
      } else {
        signerAddr = addrs[0] as `0x${string}` | undefined;
      }
    }
  }
  if (!signerAddr || !signerAddr.startsWith("0x")) {
    throw new Error("signer_account_missing");
  }

  // Create wallet client for signing
  if (typeof window === 'undefined' || !(window as { ethereum?: EthereumProvider }).ethereum) {
    throw new Error('no_ethereum_provider');
  }

  // Ensure active chain matches Monad testnet (DTK requires chain alignment)
  const eth = (window as { ethereum: EthereumProvider }).ethereum;
  const targetChainHex = `0x${monadTestnet.id.toString(16)}` as const;
  try {
    const currentChainHex = (await eth.request({ method: 'eth_chainId' })) as string;
    if (currentChainHex?.toLowerCase() !== targetChainHex.toLowerCase()) {
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetChainHex }] });
      } catch (switchErr: unknown) {
        const switchError = switchErr as { code?: number };
        // Chain not added – add then switch
        if (switchError.code === 4902) {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: targetChainHex,
              chainName: monadTestnet.name,
              nativeCurrency: monadTestnet.nativeCurrency,
              rpcUrls: monadTestnet.rpcUrls.default.http,
              blockExplorerUrls: [monadTestnet.blockExplorers?.default?.url || 'https://testnet.monadexplorer.com'],
            }],
          });
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetChainHex }] });
        } else {
          throw switchErr;
        }
      }
    }
  } catch (networkErr) {
    console.warn('[DTK] Network switch failed or not supported:', networkErr);
  }

  let normalizedSigner: `0x${string}`;
  try {
    normalizedSigner = getAddress(signerAddr);
  } catch {
    throw new Error('signer_address_invalid');
  }

  const canUseSmartAccountSigner = typeof smartAccount?.signDelegation === 'function' && Boolean(smartAccount.address);

  let viemWalletClient: ReturnType<typeof createWalletClient> | null = null;
  if (!canUseSmartAccountSigner) {
    viemWalletClient = createWalletClient({
      account: normalizedSigner,
      chain: monadTestnet,
      transport: custom((window as { ethereum: EthereumProvider }).ethereum),
    });

    console.log('[DTK] Created wallet client for signing');
  } else {
    console.log('[DTK] Using MetaMask smart account signer for delegation');
  }

  let delegateAddress: `0x${string}` | undefined;
  if (to) {
    if (!to.startsWith('0x')) {
      console.warn(`[DTK] Delegate address missing 0x prefix, ignoring provided value: ${to}`);
    } else {
      try {
        delegateAddress = getAddress(to);
      } catch (err: unknown) {
        console.warn(`[DTK] Provided delegate address is invalid: ${to}`, err);
      }
    }
  }

  if (!delegateAddress) {
    delegateAddress = normalizedSigner;
    if (to) {
      console.warn(`[DTK] Falling back to signer address for delegate: ${delegateAddress}`);
    }
  }

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
  const encodedTargets = concat([routerAddress]);

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
    delegate: delegateAddress,
    delegator: delegatorAddress,
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

    let signature: `0x${string}`;

    if (canUseSmartAccountSigner && smartAccount?.signDelegation) {
      signature = await smartAccount.signDelegation({
        delegation,
        chainId: monadTestnet.id,
      });
    } else if (viemWalletClient) {
      signature = await signDelegation(viemWalletClient, {
        account: normalizedSigner,
        delegation,
        delegationManager: delegationManager as `0x${string}`,
        chainId: monadTestnet.id,
        name: "DelegationManager",
        version: "1",
      });
    } else {
      throw new Error('delegation_signer_unavailable');
    }

    console.log('[DTK] Signature obtained:', signature.slice(0, 20) + '...');

    const signedDelegation = { ...delegation, signature } as const;

    return {
      id: `dlg_${Date.now()}`,
      signature,
      raw: signedDelegation,
      permissionContext: [signedDelegation],
      resolvedDelegate: delegateAddress,
      resolvedDelegator: delegatorAddress,
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
