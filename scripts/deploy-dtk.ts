/**
 * Deploy DTK Delegation Framework contracts to Monad testnet
 * 
 * Run: npx tsx scripts/deploy-dtk.ts
 * 
 * Prerequisites:
 * - Set DEPLOYER_PRIVATE_KEY in .env.local
 * - Ensure deployer has MON for gas
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../src/lib/chains";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("DEPLOYER_PRIVATE_KEY not set in .env.local");
  }

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  console.log("Deploying DTK contracts to Monad testnet...");
  console.log("Deployer:", account.address);
  console.log("Chain ID:", monadTestnet.id);

  const { deployDeleGatorEnvironment, overrideDeployedEnvironment } = await import(
    "@metamask/delegation-toolkit/utils"
  );

  const environment = await deployDeleGatorEnvironment(walletClient, publicClient, monadTestnet);

  console.log("\n✅ DTK contracts deployed:");
  console.log("DelegationManager:", environment.DelegationManager);
  console.log("Implementation:", environment.Implementation);

  // Register the environment
  overrideDeployedEnvironment(monadTestnet.id, "1.3.0", environment);

  console.log("\n✅ Environment registered. You can now use delegations on Monad testnet.");
  console.log("\nAdd these to your .env.local:");
  console.log(`DTK_DELEGATION_MANAGER=${environment.DelegationManager}`);
  console.log(`DTK_IMPLEMENTATION=${environment.Implementation}`);
}

main().catch((error) => {
  console.error("❌ Deploy failed:", error);
  process.exit(1);
});
