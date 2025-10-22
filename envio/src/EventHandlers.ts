import { ERC20, LegExecution } from "generated";

// Materialize LegExecution rows from ERC20 Transfer events on Monad testnet.
// We mark routerMatch=true when the transaction's "to" equals the DCA Router address.
// This approximates executions triggered via the router (aggregator pattern).

ERC20.Transfer.handler(async ({ event, context }) => {
  const router = (process.env.NEXT_PUBLIC_DCA_ROUTER_ADDRESS || "").toLowerCase();
  const txHash = event.transaction?.hash || "";
  const txTo = (event.transaction?.to || "").toLowerCase();
  const routerMatch = router !== "" && txTo === router;

  const id = txHash
    ? `${txHash}-${event.logIndex}`
    : `${event.srcAddress}-${String(event.block.number)}-${event.logIndex}`;

  const entity: LegExecution = {
    id,
    chainId: Number(event.chainId),
    txHash: txHash,
    blockNumber: BigInt(event.block.number as unknown as number),
    timestamp: BigInt(event.block.timestamp as unknown as number),
    token: event.srcAddress,
    from: event.params.from,
    to: event.params.to,
    value: event.params.value as unknown as bigint,
    routerMatch,
  } as unknown as LegExecution;

  await context.LegExecution.set(entity);
});
