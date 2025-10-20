# DCA Sitter

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
# AI Planning (ADK-TS)
GOOGLE_API_KEY=your_gemini_api_key
ADK_MODEL=gemini-2.5-flash

# DTK Contracts (run deploy script first, see step 3)
NEXT_PUBLIC_DTK_DELEGATION_MANAGER=0x...
NEXT_PUBLIC_DTK_IMPLEMENTATION=0x...

# Optional: For deploying DTK contracts
DEPLOYER_PRIVATE_KEY=0x...
```

### 3. Deploy DTK Delegation Framework to Monad

**Important**: Monad testnet doesn't have DTK contracts deployed yet. You must deploy them once:

```bash
# Install tsx
npm install -D tsx

# Set DEPLOYER_PRIVATE_KEY in .env.local (funded with MON)
# Then run:
npx tsx scripts/deploy-dtk.ts
```

This will:
- Deploy Delegation Framework contracts to Monad testnet
- Output the `DelegationManager` and `Implementation` addresses
- Add those addresses to your `.env.local` as shown above

**After deployment**, copy the printed addresses and add them to `.env.local`:
```env
NEXT_PUBLIC_DTK_DELEGATION_MANAGER=0x<DelegationManager_address>
NEXT_PUBLIC_DTK_IMPLEMENTATION=0x<Implementation_address>
```

### 4. Run the app

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
3. **Generate AI Plan**: Click "Generate with AI" to create an optimized schedule
4. **Create Delegation**:
   - Router address: Your deployed DCA Router contract (`0x9dA65B3413b6031E05F1E1eB58F8312084890e56`)
   - Delegate address: EOA that will execute on your behalf
   - Spend cap and expiry
5. **Execute**: (Manual execution UI/automation coming soon)

## Architecture

- **Frontend**: Next.js 15 (App Router), Wagmi, Viem
- **AI Agent**: ADK-TS with Gemini for plan generation
- **Smart Accounts**: MetaMask Delegation Toolkit (Hybrid implementation)
- **Contracts**: DCA Router on Monad testnet + DTK Delegation Framework
- **Execution**: Delegated transactions via DTK

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

### "Delegation environment not available on this chain"

Run the DTK deployment script:
```bash
npx tsx scripts/deploy-dtk.ts
```

### "wallet_client_missing" or button disabled

- Ensure MetaMask is connected to Monad Testnet
- Refresh the page and reconnect

### AI plan fails

Check `.env.local` has `GOOGLE_API_KEY` set.

## Resources

- [MetaMask Delegation Toolkit Docs](https://docs.metamask.io/delegation-toolkit)
- [Monad Docs](https://docs.monad.xyz)
- [ADK-TS Docs](../docs/) (local)
- [DCA Sitter PRD](../DCA_Sitter_PRD.md)
