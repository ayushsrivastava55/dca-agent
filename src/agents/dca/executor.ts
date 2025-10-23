import { createPublicClient, createWalletClient, http, parseUnits, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "@/lib/chains";
import { emitLegStarted, emitLegCompleted, emitLegFailed } from "./events";
import { redeemDelegations, createExecution, ExecutionMode } from "@metamask/delegation-toolkit";
import type { Delegation } from "@metamask/delegation-toolkit";

export type DcaPlan = {
  index: number;
  amount: number;
  atISO: string;
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  txHash?: string;
  error?: string;
};

export type ExecutionRequest = {
  delegationId: string;
  delegator: `0x${string}`;
  delegate: `0x${string}`;
  router: `0x${string}`;
  plan: DcaPlan[];
  tokenIn: string;
  tokenOut: string;
  permissionContext: Delegation[];
};

export type ExecutionResult = {
  success: boolean;
  txHash?: string;
  error?: string;
  gasUsed?: bigint;
};

export class DcaExecutor {
  private publicClient;
  private walletClient;
  private agentAccount;

  constructor(agentPrivateKey?: string) {
    if (!agentPrivateKey) {
      throw new Error('DcaExecutor requires AGENT_PRIVATE_KEY for server-side automated execution. For client-side execution, use the execution utilities in @/lib/execution instead.');
    }
    
    // Create agent account from private key
    this.agentAccount = privateKeyToAccount(agentPrivateKey as `0x${string}`);

    // Create clients
    this.publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    this.walletClient = createWalletClient({
      account: this.agentAccount,
      chain: monadTestnet,
      transport: http(),
    });
  }

  /**
   * Execute a single DCA leg
   */
  async executeLeg(request: ExecutionRequest, legIndex: number): Promise<ExecutionResult> {
    // Emit leg started event
    emitLegStarted(request.delegationId, request.delegationId, legIndex);

    try {
      const leg = request.plan.find(p => p.index === legIndex);
      if (!leg) {
        const error = `Leg ${legIndex} not found in plan`;
        emitLegFailed(request.delegationId, request.delegationId, legIndex, error);
        throw new Error(error);
      }

      console.log(`[DCA Executor] Executing leg ${legIndex} for delegation ${request.delegationId}`);
      console.log(`[DCA Executor] Amount: ${leg.amount} ${request.tokenIn} -> ${request.tokenOut}`);

      // For now, simulate the DCA execution by calling a simple function on the router
      // In a real implementation, this would interact with a DEX aggregator
      const amount = parseUnits(leg.amount.toString(), 18); // Assuming 18 decimals

      // Encode actual router call executeLeg(uint256,address)
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
        args: [amount, request.delegator],
      });

      // Execute under delegation via DelegationManager
      const delegationManager = process.env.NEXT_PUBLIC_DTK_DELEGATION_MANAGER as `0x${string}` | undefined;
      if (!delegationManager) throw new Error('delegation_manager_env_missing');

      const execution = createExecution({
        target: request.router,
        value: BigInt(0),
        callData: calldata,
      });

      const txHash = await redeemDelegations(
        this.walletClient,
        this.publicClient,
        delegationManager,
        [
          {
            permissionContext: request.permissionContext,
            executions: [execution],
            mode: ExecutionMode.SingleDefault,
          },
        ],
      );

      console.log(`[DCA Executor] Transaction sent: ${txHash}`);

      // Wait for transaction receipt
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status === 'success') {
        console.log(`[DCA Executor] Leg ${legIndex} executed successfully`);

        // Emit leg completed event
        emitLegCompleted(request.delegationId, request.delegationId, legIndex, txHash);

        return {
          success: true,
          txHash,
          gasUsed: receipt.gasUsed,
        };
      } else {
        const error = 'Transaction failed';
        emitLegFailed(request.delegationId, request.delegationId, legIndex, error);
        throw new Error(error);
      }

    } catch (error: unknown) {
      console.error(`[DCA Executor] Failed to execute leg ${legIndex}:`, error);

      // Emit leg failed event
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emitLegFailed(request.delegationId, request.delegationId, legIndex, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if a leg is ready for execution based on its scheduled time
   */
  isLegReady(leg: DcaPlan): boolean {
    const now = new Date();
    const scheduledTime = new Date(leg.atISO);
    return now >= scheduledTime && leg.status === 'pending';
  }

  /**
   * Get the next leg that's ready for execution
   */
  getNextReadyLeg(plan: DcaPlan[]): DcaPlan | null {
    return plan.find(leg => this.isLegReady(leg)) || null;
  }

  /**
   * Validate that the agent has permission to execute for this delegation
   * In a real implementation, this would verify the delegation signature and caveats
   */
  async validateDelegation(request: ExecutionRequest): Promise<boolean> {
    try {
      // Check that we are the designated delegate
      if (request.delegate.toLowerCase() !== this.agentAccount.address.toLowerCase()) {
        console.warn(`[DCA Executor] Agent address ${this.agentAccount.address} does not match delegate ${request.delegate}`);
        return false;
      }

      // TODO: Verify delegation signature and caveats on-chain
      // This would involve calling the DelegationManager contract to validate

      console.log(`[DCA Executor] Delegation validated for ${request.delegationId}`);
      return true;
    } catch (error) {
      console.error('[DCA Executor] Delegation validation failed:', error);
      return false;
    }
  }

  /**
   * Get agent address
   */
  get address(): `0x${string}` {
    return this.agentAccount.address;
  }
}

// Singleton instance
let executorInstance: DcaExecutor | null = null;

/**
 * Get DCA executor for server-side automated execution
 * WARNING: This requires AGENT_PRIVATE_KEY environment variable
 * For most use cases, users should execute delegations client-side using @/lib/execution
 */
export function getDcaExecutor(): DcaExecutor {
  if (!executorInstance) {
    const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
    if (!agentPrivateKey) {
      throw new Error(
        'AGENT_PRIVATE_KEY not configured. ' +
        'This is only needed for server-side automated execution. ' +
        'For client-side execution (recommended), use executeDelegatedTransaction from @/lib/execution instead.'
      );
    }
    executorInstance = new DcaExecutor(agentPrivateKey);
  }
  return executorInstance;
}

/**
 * Check if server-side executor is available
 */
export function isExecutorAvailable(): boolean {
  return !!process.env.AGENT_PRIVATE_KEY;
}