# Monad Token Scanner

A Node.js script to check Monad mainnet status and scan token contracts to identify profitable wallets.

## Features

- ✅ Check if Monad mainnet is live
- 🔍 Scan token contracts for all transfer events
- 💰 Identify profitable wallets based on buy/sell patterns
- 📊 Generate detailed reports with wallet rankings

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update `.env` with your Monad RPC endpoint (when mainnet is live):
```
MONAD_RPC_URL=https://rpc.monad.xyz
```

## Usage

### Check Mainnet Status

```bash
npm run check-mainnet
```

or

```bash
node check-mainnet.js
```

### Scan Token for Profitable Wallets

```bash
npm run scan-token <TOKEN_ADDRESS> [RPC_URL] [FROM_BLOCK] [TO_BLOCK]
```

**Examples:**

```bash
# Scan from genesis block to latest
node scan-token.js 0x1234567890123456789012345678901234567890

# Scan with custom RPC
node scan-token.js 0x1234...7890 https://rpc.monad.xyz

# Scan specific block range
node scan-token.js 0x1234...7890 https://rpc.monad.xyz 1000000 2000000
```

### Real-Time Token Monitoring

```bash
npm run monitor-token <TOKEN_ADDRESS> [RPC_URL] [OPTIONS]
```

**Options:**
- `--update-interval <ms>` - Report update interval (default: 30000ms)
- `--price-interval <ms>` - Price update interval (default: 60000ms)
- `--min-profit <usd>` - Minimum profit to show (default: 0)
- `--alert-threshold <usd>` - Alert threshold for profitable wallets (default: 1000)
- `--log-file <path>` - Optional log file path

**Examples:**

```bash
# Basic monitoring
node monitor-token.js 0x1234...7890

# Monitor with custom thresholds
node monitor-token.js 0x1234...7890 --min-profit 100 --alert-threshold 5000

# Monitor with logging
node monitor-token.js 0x1234...7890 --log-file monitor.log
```

## How It Works

### Token Scanner (`scan-token.js`)
1. **Token Scanning**: Fetches all `Transfer` events from the token contract
2. **Price Integration**: Fetches current USD price from CoinGecko API
3. **Wallet Tracking**: Tracks all buy and sell transactions for each wallet
4. **Profitability Calculation**: 
   - Calculates realized profit in USD (tokens sold value - cost basis)
   - Calculates unrealized profit in USD (current holdings value - cost basis)
   - Calculates total profit and ROI percentage
   - Generates a profitability score based on USD values
5. **Reporting**: Generates a JSON report with USD values and displays top profitable wallets

### Real-Time Monitor (`monitor-token.js`)
1. **Event Listening**: Subscribes to Transfer events in real-time
2. **Price Updates**: Periodically fetches updated token prices
3. **Wallet Tracking**: Continuously updates wallet balances and transactions
4. **Profit Alerts**: Alerts when wallets exceed profit thresholds
5. **Periodic Reports**: Generates status reports at configurable intervals
6. **Logging**: Optional file logging for all events

## Output

The script generates:
- Console output with top profitable wallets
- JSON report file: `profitable-wallets-<SYMBOL>-<TIMESTAMP>.json`

## Price Integration

The scripts use **CoinGecko API** for USD price data:
- Automatic price fetching for tokens by contract address
- Fallback to symbol-based lookup if contract address fails
- Price caching (1 minute) to avoid rate limits
- Optional CoinGecko API key for higher rate limits (set `COINGECKO_API_KEY` in `.env`)

**Note**: Historical prices use current price as approximation. For accurate historical analysis, consider integrating DEX price feeds or Chainlink oracles.

## Notes

- ⚠️ **Mainnet Status**: Monad mainnet is scheduled to launch on November 24, 2025. Update RPC endpoints when available.
- 📡 **Rate Limiting**: The scripts include delays to avoid overwhelming RPC endpoints and API services
- 💰 **Price Data**: USD values are calculated using current token price. Historical prices use current price as approximation.
- 🔄 **Block Range**: For large block ranges, scanning may take time. Consider using specific ranges
- 🔔 **Real-Time Monitoring**: The monitor script runs continuously. Use Ctrl+C to stop gracefully
- 📊 **CoinGecko API**: Free tier has rate limits. Add `COINGECKO_API_KEY` to `.env` for higher limits
- ⚡ **Parallel Scanning**: Enabled by default for faster scanning. Use `--no-parallel` to disable
- 🌐 **Free RPC Endpoints**: The script includes multiple free RPC endpoints with automatic fallback

## Free RPC Endpoints

The script includes several free Monad RPC endpoints:
- `https://rpc.monad.xyz` (Public)
- `https://monad-rpc.publicnode.com` (PublicNode)
- `https://rpc.ankr.com/monad` (Ankr - may require free account)

You can also add your own in `.env`:
```
MONAD_RPC_URL=https://your-rpc-endpoint.com
```

For better performance, consider:
- **Ankr**: Free tier available at https://www.ankr.com
- **Chainstack**: Free tier available at https://chainstack.com
- **dRPC**: Free tier available at https://drpc.org
- **QuickNode**: Free tier available at https://quicknode.com

## Requirements

- Node.js 18+ 
- Access to Monad RPC endpoint (when mainnet is live)

## License

MIT

