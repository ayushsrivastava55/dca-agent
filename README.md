# KeeperDCA (previously DCA-Sitter)

AI-powered Dollar-Cost Averaging (DCA) on Monad using MetaMask Delegation Toolkit and ADK-TS agents.

## Features

- **AI Planning**: Uses ADK-TS agent with Gemini to generate optimized DCA schedules
- **Delegated Execution**: MetaMask Smart Accounts + Delegation Toolkit for gasless, automated execution
- **Monad Testnet**: Built for Monad's high-performance EVM
- **Modern Stack**: Next.js 15, Viem, Wagmi, TailwindCSS

## Prerequisites

- Node.js 22+ (recommended for ADK compatibility)
- MetaMask wallet with Monad Testnet configured
- MON tokens from [Monad Faucet](https://faucet.monad.xyz/)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env.local`:

```env
# DTK Contract Addresses (Already deployed on Monad testnet)
NEXT_PUBLIC_DTK_DELEGATION_MANAGER=0x1e4B42f77EB0A994e4fdF706Caa3E3746273832C
NEXT_PUBLIC_DTK_IMPLEMENTATION=0x6e4C528d46dA0F636E3b3E43004B9870fc6dFECa
NEXT_PUBLIC_DTK_NATIVE_TOKEN_ENFORCER=0x3b6B9A768E29deeAA9DE9651088B55886Fc0e2f0
NEXT_PUBLIC_DTK_ALLOWED_TARGETS_ENFORCER=0xB230e7D4D41dBd6D01049F0E59943f21D4f176e1
NEXT_PUBLIC_DTK_TIMESTAMP_ENFORCER=0x2A00AB50544ddda3780061cC7823d7e0447Ba1AB

# DCA Router (Already deployed on Monad testnet)
NEXT_PUBLIC_DCA_ROUTER_ADDRESS=0x9dA65B3413b6031E05F1E1eB58F8312084890e56

# AI Planning (Optional - for AI-optimized DCA schedules)
# Choose ONE provider (OpenAI or Google Gemini)

# Option 1: OpenAI (recommended for production)
OPENAI_API_KEY=your_openai_api_key
ADK_MODEL=gpt-4o-mini

# Option 2: Google Gemini (default if OpenAI not set)
GOOGLE_API_KEY=your_gemini_api_key
ADK_MODEL=gemini-2.5-flash

# Server-Side Automated Execution (OPTIONAL - not recommended)
# Only set this if you want server-side automated execution
# For most users, client-side execution is more secure
# AGENT_PRIVATE_KEY=0x...
```

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Connect Wallet**: Connect MetaMask on Monad Testnet
2. **Configure DCA**:
   - Token pair (e.g., MON → USDC)
   - Budget and number of legs
   - Interval (minutes between executions)
3. **Generate AI Plan** (Optional): Click "Generate with AI" to create an optimized schedule
4. **Create Delegation**:
   - Delegate address will auto-fill with your own address (recommended for security)
   - Set spend cap and expiry
   - Click "One-Click Start" to create delegation
5. **Execute Legs**:
   - Click "Execute Next Leg" to manually execute each leg when ready
   - Your wallet will prompt you to sign each transaction
   - No private key or server-side agent needed!

## Architecture

- **Frontend**: Next.js 15 (App Router), Wagmi, Viem
- **AI Agent**: ADK-TS with Gemini for plan generation (optional)
- **Smart Accounts**: MetaMask Delegation Toolkit (Hybrid implementation)
- **Contracts**: DCA Router on Monad testnet + DTK Delegation Framework
- **Execution**:
  - **Client-Side** (Recommended): User executes delegations from their own wallet
  - **Server-Side** (Optional): Automated execution via agent (requires AGENT_PRIVATE_KEY)

## Project Structure

```
src/
├── agents/dca/          # ADK-TS agent (planner)
├── app/                 # Next.js routes & UI
├── components/          # React components
├── hooks/               # React hooks (Smart Account, etc.)
├── lib/                 # Viem/Wagmi config, delegation service
scripts/
└── deploy-dtk.ts        # DTK contract deployment script
```

## Troubleshooting

### "delegation_manager_missing" error

Ensure all DTK contract addresses are set in `.env.local`:

```env
NEXT_PUBLIC_DTK_DELEGATION_MANAGER=0x1e4B42f77EB0A994e4fdF706Caa3E3746273832C
NEXT_PUBLIC_DTK_ALLOWED_TARGETS_ENFORCER=0xB230e7D4D41dBd6D01049F0E59943f21D4f176e1
NEXT_PUBLIC_DTK_NATIVE_TOKEN_ENFORCER=0x3b6B9A768E29deeAA9DE9651088B55886Fc0e2f0
NEXT_PUBLIC_DTK_TIMESTAMP_ENFORCER=0x2A00AB50544ddda3780061cC7823d7e0447Ba1AB
NEXT_PUBLIC_DCA_ROUTER_ADDRESS=0x9dA65B3413b6031E05F1E1eB58F8312084890e56
```

### "wallet_client_missing" or button disabled

- Ensure MetaMask is connected to Monad Testnet
- Refresh the page and reconnect

### AI plan fails

Check `.env.local` has either `OPENAI_API_KEY` or `GOOGLE_API_KEY` set. If using OpenAI, set `ADK_MODEL=gpt-4o-mini` (or another OpenAI model).

### About AGENT_PRIVATE_KEY

You do **NOT** need `AGENT_PRIVATE_KEY` for normal usage. The app now supports client-side execution where you execute delegations from your own wallet. Only set this if you specifically need server-side automated execution.

## Resources

- [MetaMask Delegation Toolkit Docs](https://docs.metamask.io/delegation-toolkit)
- [Monad Docs](https://docs.monad.xyz)
- [ADK-TS Docs](../docs/) (local)
- [DCA Sitter PRD](../DCA_Sitter_PRD.md)

## Automated Execution Loop

To keep delegations running 24/7 without clicking "Execute Next Leg", enable the background loop agent:

1. Add the following to your `.env.local` (and restart the app):
   ```bash
   ENABLE_DCA_LOOP_AGENT=true
   DCA_LOOP_INTERVAL_MS=30000        # optional; interval in milliseconds between checks
   DCA_LOOP_IDLE_LOGS=10             # optional; heartbeat logs after N idle polls
   AGENT_PRIVATE_KEY=0x...          # the delegate key that matches the delegation's delegate address
   ```

2. Schedule a plan via the `/api/agent/execute` endpoint (the dashboard button does this automatically). When the first plan is scheduled the loop agent starts, and it wakes every `DCA_LOOP_INTERVAL_MS` to process ready legs.

3. Logs tagged with `[DCA Loop]` confirm the runner is active. If the private key or delegate mismatch is incorrect you will see warnings in the server log.

Leave `ENABLE_DCA_LOOP_AGENT` unset to fall back to manual/on-demand execution.
