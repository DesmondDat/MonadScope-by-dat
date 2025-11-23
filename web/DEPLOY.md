# Deployment Guide - Monad Token Scanner Web

## Quick Deploy to Vercel

### Option 1: Deploy from GitHub (Recommended)

1. **Push to GitHub:**
   ```bash
   cd web
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Deploy on Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Select the `web` folder as root directory
   - Add environment variables:
     - `MONAD_RPC_URL` = `https://rpc.monad.xyz` (or your RPC)
     - `COINGECKO_API_KEY` = (optional, your API key)
   - Click "Deploy"

### Option 2: Deploy via Vercel CLI

```bash
cd web
npm install -g vercel
vercel
```

Follow the prompts and add environment variables when asked.

## Environment Variables

Add these in Vercel dashboard under Project Settings → Environment Variables:

- `MONAD_RPC_URL` - Your Monad RPC endpoint
- `COINGECKO_API_KEY` - (Optional) CoinGecko API key for better rate limits

## Important Notes

1. **File Structure**: The scanner files need to be accessible from the `web` directory. You may need to:
   - Copy `scan-token.js`, `price-service.js`, `rpc-endpoints.js` to `web/lib/`
   - Or adjust import paths in API routes

2. **Function Timeout**: Vercel free tier has 10s timeout for Hobby plan. For longer scans:
   - Upgrade to Pro plan (5 min timeout)
   - Or use Vercel Pro with extended timeouts
   - Or implement background jobs with a queue system

3. **Server-Sent Events**: SSE works on Vercel, but for production consider:
   - Using WebSockets (requires different hosting)
   - Or polling-based updates
   - Or a dedicated real-time service

## Alternative: Deploy Scanner Files

If imports from parent directory don't work, copy these files to `web/lib/`:

```bash
cp scan-token.js web/lib/
cp price-service.js web/lib/
cp rpc-endpoints.js web/lib/
```

Then update imports in `web/app/api/scan/route.ts`:
```typescript
const { TokenScanner } = await import('../../lib/scan-token.js')
```

## Testing Locally

```bash
cd web
npm install
npm run dev
```

Visit http://localhost:3000

## Troubleshooting

### Import Errors
- Make sure all scanner files are accessible
- Check file paths in imports
- Ensure `.js` files use ES modules (`"type": "module"`)

### Timeout Issues
- Reduce block range
- Use smaller batch sizes
- Implement chunked scanning

### SSE Not Working
- Check Vercel function logs
- Verify EventSource connection in browser console
- Consider polling as fallback

## Production Recommendations

1. **Use Redis** for scan state (instead of in-memory Map)
2. **Add rate limiting** to prevent abuse
3. **Implement caching** for token info
4. **Add error monitoring** (Sentry, etc.)
5. **Use background jobs** for long scans (Vercel Cron + Queue)

