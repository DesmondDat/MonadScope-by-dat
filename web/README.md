# Monad Token Scanner - Web Interface

A beautiful, real-time web interface for scanning profitable wallets on Monad blockchain.

## Features

- 🎨 Modern, responsive UI with Tailwind CSS
- ⚡ Real-time progress updates via Server-Sent Events
- 💰 USD profit calculations with CoinGecko integration
- 📊 Interactive wallet ranking table
- 🚀 Optimized for Vercel deployment

## Getting Started

### Development

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env.local` file:

```env
MONAD_RPC_URL=https://rpc.monad.xyz
COINGECKO_API_KEY=your_api_key_here
```

## Deployment to Vercel

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Deploy to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Add environment variables:
     - `MONAD_RPC_URL`
     - `COINGECKO_API_KEY` (optional)
   - Deploy!

3. **Configure Vercel:**
   - The `vercel.json` file is already configured
   - API routes have extended timeout (5 minutes)
   - Server-Sent Events are enabled

## Project Structure

```
web/
├── app/
│   ├── api/
│   │   └── scan/
│   │       ├── route.ts          # Scan API endpoint
│   │       └── [scanId]/
│   │           └── stream/
│   │               └── route.ts  # SSE stream endpoint
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── TokenScanner.tsx
│   │   └── Features.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── package.json
├── next.config.js
├── tailwind.config.js
└── vercel.json
```

## API Endpoints

### POST `/api/scan`
Start a new token scan.

**Request:**
```json
{
  "tokenAddress": "0x...",
  "fromBlock": 0  // optional
}
```

**Response:**
```json
{
  "scanId": "scan_1234567890_abc123",
  "status": "started"
}
```

### GET `/api/scan?scanId=<scanId>`
Get scan status and results.

### GET `/api/scan/[scanId]/stream`
Server-Sent Events stream for real-time updates.

## Customization

- **Colors**: Edit `tailwind.config.js` to change theme colors
- **Features**: Modify `components/Features.tsx` to update feature list
- **Styling**: Update `app/globals.css` for custom styles

## Performance

- Parallel processing enabled by default
- Optimized for Vercel's serverless functions
- Efficient SSE streaming for real-time updates
- Client-side state management with React hooks

## License

MIT

