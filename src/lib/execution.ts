import { createPublicClient, createWalletClient, custom, http, encodeFunctionData } from "viem";
import { monadTestnet } from "@/lib/chains";
import { createExecution, ExecutionMode } from "@metamask/delegation-toolkit";
import { DelegationManager } from "@metamask/delegation-toolkit/contracts";
import type { Delegation } from "@metamask/delegation-toolkit";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

export type ExecuteDelegationParams = {
  delegation: Delegation;
  router: `0x${string}`;
  amount: bigint;
  recipient: `0x${string}`;
  walletClient: unknown;
};

export type ExecutionResult = {
  success: boolean;
  txHash?: string;
  error?: string;
};

/**
 * Execute a single DCA leg using a signed delegation
 * This runs client-side using the user's wallet - no server-side private key needed!
 */
export async function executeDelegatedTransaction(params: ExecuteDelegationParams): Promise<ExecutionResult> {
  const { delegation, router, amount, recipient, walletClient } = params;

  try {
    if (!walletClient) throw new Error("wallet_client_missing");

    // Get delegation manager address
    const delegationManager = process.env.NEXT_PUBLIC_DTK_DELEGATION_MANAGER as `0x${string}` | undefined;
    if (!delegationManager) throw new Error("delegation_manager_missing");

    // Get delegate address from wallet client
    let delegateAddr = (walletClient as { account?: { address?: string } })?.account?.address as `0x${string}` | undefined;
    if (!delegateAddr && typeof (walletClient as { getAddresses?: () => Promise<string[]> })?.getAddresses === "function") {
      const addrs = await (walletClient as { getAddresses: () => Promise<string[]> }).getAddresses();
      delegateAddr = addrs?.[0] as `0x${string}` | undefined;
    }
    if (!delegateAddr) throw new Error("delegate_address_missing");

    // Create viem wallet client for the delegate
    if (typeof window === 'undefined' || !(window as { ethereum?: EthereumProvider }).ethereum) {
      throw new Error('no_ethereum_provider');
    }

    const viemWalletClient = createWalletClient({
      account: delegateAddr,
      chain: monadTestnet,
      transport: custom((window as { ethereum: EthereumProvider }).ethereum),
    });

    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    // Encode the router call: executeLeg(uint256 amount, address recipient)
    const calldata = encodeFunctionData({
      abi: [
        {
          name: 'executeLeg',
          type: 'function',
          inputs: [
            { name: 'amount', type: 'uint256' },
            { name: 'recipient', type: 'address' }
          ],
          outputs: [],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'executeLeg',
      args: [amount, recipient],
    });

    console.log('[Execution] Creating execution for router:', router);
    console.log('[Execution] Amount:', amount.toString(), 'Recipient:', recipient);

    // Create execution
    const execution = createExecution({
      target: router,
      value: BigInt(0),
      callData: calldata,
    });

    // Prepare redemption calldata
    const redeemDelegationCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[delegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    console.log('[Execution] Sending transaction to DelegationManager:', delegationManager);

    // Send transaction from delegate wallet (user's wallet)
    const txHash = await viemWalletClient.sendTransaction({
      to: delegationManager,
      data: redeemDelegationCalldata,
      chain: monadTestnet,
    });

    console.log('[Execution] Transaction sent:', txHash);

    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    if (receipt.status === 'success') {
      console.log('[Execution] Transaction confirmed');
      return {
        success: true,
        txHash,
      };
    } else {
      throw new Error('Transaction failed');
    }

  } catch (error: unknown) {
    console.error('[Execution] Failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute multiple legs in a batch
 */
export async function executeBatchDelegations(
  delegations: Delegation[],
  executions: Array<{ router: `0x${string}`; amount: bigint; recipient: `0x${string}` }>,
  walletClient: unknown
): Promise<ExecutionResult> {
  try {
    if (!walletClient) throw new Error("wallet_client_missing");
    if (delegations.length !== executions.length) throw new Error("delegations_executions_mismatch");

    const delegationManager = process.env.NEXT_PUBLIC_DTK_DELEGATION_MANAGER as `0x${string}` | undefined;
    if (!delegationManager) throw new Error("delegation_manager_missing");

    // Get delegate address
    let delegateAddr = (walletClient as { account?: { address?: string } })?.account?.address as `0x${string}` | undefined;
    if (!delegateAddr && typeof (walletClient as { getAddresses?: () => Promise<string[]> })?.getAddresses === "function") {
      const addrs = await (walletClient as { getAddresses: () => Promise<string[]> }).getAddresses();
      delegateAddr = addrs?.[0] as `0x${string}` | undefined;
    }
    if (!delegateAddr) throw new Error("delegate_address_missing");

    if (typeof window === 'undefined' || !(window as { ethereum?: EthereumProvider }).ethereum) {
      throw new Error('no_ethereum_provider');
    }

    const viemWalletClient = createWalletClient({
      account: delegateAddr,
      chain: monadTestnet,
      transport: custom((window as { ethereum: EthereumProvider }).ethereum),
    });

    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    // Create executions for each leg
    const executionsList = executions.map(exec => {
      const calldata = encodeFunctionData({
        abi: [
          {
            name: 'executeLeg',
            type: 'function',
            inputs: [
              { name: 'amount', type: 'uint256' },
              { name: 'recipient', type: 'address' }
            ],
            outputs: [],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'executeLeg',
        args: [exec.amount, exec.recipient],
      });

      return createExecution({
        target: exec.router,
        value: BigInt(0),
        callData: calldata,
      });
    });

    // Prepare batch redemption
    const redeemDelegationCalldata = DelegationManager.encode.redeemDelegations({
      delegations: delegations.map(d => [d]),
      modes: delegations.map(() => ExecutionMode.SingleDefault),
      executions: executionsList.map(e => [e]),
    });

    // Send transaction
    const txHash = await viemWalletClient.sendTransaction({
      to: delegationManager,
      data: redeemDelegationCalldata,
      chain: monadTestnet,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    if (receipt.status === 'success') {
      return {
        success: true,
        txHash,
      };
    } else {
      throw new Error('Batch transaction failed');
    }

  } catch (error: unknown) {
    console.error('[Batch Execution] Failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
