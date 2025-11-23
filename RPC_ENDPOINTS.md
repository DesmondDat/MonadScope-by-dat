# Free Monad RPC Endpoints

This document lists free RPC endpoints for Monad blockchain that you can use with the scanner.

## Currently Included (No API Key Required)

1. **Public Monad RPC**
   - `https://rpc.monad.xyz`
   - Public endpoint, may have rate limits

2. **PublicNode**
   - `https://monad-rpc.publicnode.com`
   - Free public RPC

3. **Ankr**
   - `https://rpc.ankr.com/monad`
   - Free tier available (may require account)

## Recommended Free Tier Providers

### 1. Ankr (Recommended)
- **Website**: https://www.ankr.com
- **Free Tier**: Yes
- **Rate Limits**: Generous free tier
- **Setup**: Create free account, get API key
- **Endpoint Format**: `https://rpc.ankr.com/monad/YOUR_API_KEY`

### 2. Chainstack
- **Website**: https://chainstack.com
- **Free Tier**: Yes (14-day trial, then free tier available)
- **Rate Limits**: Good for development
- **Setup**: Sign up for free account
- **Endpoint Format**: Provided after signup

### 3. dRPC
- **Website**: https://drpc.org
- **Free Tier**: Yes
- **Rate Limits**: Limited but usable
- **Setup**: Create free account
- **Endpoint Format**: Provided after signup

### 4. QuickNode
- **Website**: https://quicknode.com
- **Free Tier**: Limited free tier
- **Rate Limits**: Good for testing
- **Setup**: Sign up for free account
- **Note**: May have Monad testnet only initially

## How to Add Your Own RPC

1. Get an API key from one of the providers above
2. Add to `.env` file:
   ```
   MONAD_RPC_URL=https://your-rpc-endpoint.com/your-api-key
   ```

3. Or use directly in command:
   ```bash
   node scan-token.js <TOKEN_ADDRESS> https://your-rpc-endpoint.com/your-api-key
   ```

## Rate Limits

Free tier RPCs typically have these limits:
- **Alchemy Free**: 10 blocks per `eth_getLogs` query
- **Ankr Free**: Higher limits, varies
- **Public RPCs**: Very limited, may throttle

## Tips

1. **For faster scanning**: Get a free API key from Ankr or Chainstack
2. **For production**: Consider paid tiers for higher rate limits
3. **Multiple endpoints**: The script will automatically try different endpoints if one fails
4. **Parallel processing**: Enabled by default, processes 5 batches simultaneously

## Testing RPC Endpoints

You can test if an RPC endpoint works:

```bash
node check-mainnet.js
```

Or test a specific endpoint:
```bash
node -e "import('ethers').then(m => { const p = new m.ethers.JsonRpcProvider('YOUR_RPC_URL'); p.getBlockNumber().then(n => console.log('Block:', n)).catch(e => console.error('Error:', e.message)); })"
```

