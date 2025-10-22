# DCA Sitter — Envio Integration (HyperIndex + HyperSync)

This folder contains a minimal HyperIndex indexer setup to qualify for the Envio bounty and power on-chain analytics in the app.

It indexes ERC20 `Transfer(address indexed from, address indexed to, uint256 value)` events for selected tokens on Monad testnet (chainId 10143) and flags transfers made in transactions that go to the DCA Router address. This approximates DCA leg executions and produces a queryable GraphQL API.

## Prerequisites
- Node 18+
- Envio CLI (or use `npx`): https://docs.envio.dev/docs/HyperIndex/contract-import
- HyperSync API token (recommended): https://docs.envio.dev/docs/HyperSync/api-tokens
- Env vars:
  - `WMON_ADDRESS=0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701` (Monad WMON from Monad docs)
  - `USDC_ADDRESS=<your_testnet_usdc>` (optional; leave empty if unknown)
  - `NEXT_PUBLIC_DCA_ROUTER_ADDRESS=0x9dA65B3413b6031E05F1E1eB58F8312084890e56`
  - `ENVIO_API_TOKEN=<your_token>` (if self-hosted and needed)

## Files
- `config.yaml` — HyperIndex configuration (contracts, events, networks, field selection)
- `schema.graphql` — GraphQL schema for the indexed data (`LegExecution`)
- `src/EventHandlers.ts` — Event handler that materializes `LegExecution` entities from ERC20 transfers in router-bound txs

## Run locally (self-hosted)
1) Install dependencies in a new HyperIndex project folder (run from `envio/`):

```bash
# Option 1: initialize a new HyperIndex project in place (recommended)
# npx envio init
# When prompted, choose: Contract Import -> Local ABI -> ERC20 (we provide handler code already)

# Or if you've already got a global CLI, just install packages and run
npm i
```

2) Copy these files over the generated ones (if you used `envio init`), or keep as is if you structured manually.

3) Start indexing (local Postgres + Hasura or Envio-hosted depending on your setup):

```bash
# These commands vary by setup; refer to Envio docs for exact commands
# Examples:
# npx envio dev            # local mode
# npx envio up             # dockerized db + hasura (if using templates)
# npx envio start          # start indexer
```

4) Note the GraphQL endpoint URL (Hasura). Export it to the Next.js app as:

```bash
# in dca-sitter/.env.local
NEXT_PUBLIC_ENVIO_GRAPHQL_URL=http://localhost:8080/v1/graphql
```

5) In the Next.js app, wire a panel to show `LegExecution` rows via GraphQL (we added a server stub under `/api/envio/executions` and can finish GraphQL consumer next).

## Deploy hosted
Follow https://docs.envio.dev/docs/HyperIndex/getting-started to deploy to Envio’s hosted HyperIndex and obtain your public GraphQL URL. Set `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` accordingly.

## Notes
- HyperSync backs HyperIndex by default for supported networks (Monad testnet is supported per Monad docs). Ensure your token is configured if your plan requires it.
- If you prefer a pure HyperSync approach, implement the Node client in the Next.js route `/api/envio/executions` (we scaffolded a safe dynamic import) filtering `transactions.to == router` and decode calldata with Viem to show `executeLeg` args.
