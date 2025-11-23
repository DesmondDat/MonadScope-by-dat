import { NextRequest, NextResponse } from 'next/server'

// In-memory store for active scans (use Redis in production)
const activeScans = new Map<string, any>()

export async function POST(request: NextRequest) {
  try {
    const { tokenAddress, fromBlock } = await request.json()

    if (!tokenAddress) {
      return NextResponse.json({ error: 'Token address is required' }, { status: 400 })
    }

    // Validate token address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return NextResponse.json({ error: 'Invalid token address format' }, { status: 400 })
    }

    // Generate unique scan ID
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const rpcUrl = process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz'

    // Store scan state
    activeScans.set(scanId, {
      status: 'running',
      startTime: Date.now(),
      progress: { progress: 0, currentBlock: 0, totalBlocks: 0, eventsFound: 0, walletsTracked: 0 },
      tokenInfo: null,
      wallets: null,
      error: null,
    })

    // Start scanning asynchronously (don't await)
    startScanAsync(scanId, tokenAddress, fromBlock, rpcUrl).catch((error) => {
      const scan = activeScans.get(scanId)
      if (scan) {
        scan.status = 'error'
        scan.error = error.message
      }
    })

    return NextResponse.json({ scanId, status: 'started' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function startScanAsync(
  scanId: string,
  tokenAddress: string,
  fromBlock: number | null,
  rpcUrl: string
) {
  try {
    // Dynamically import the scanner
    // Try lib first (if files were copied), then fallback to parent directory
    let TokenScanner: any
    try {
      const module = await import('../../lib/scan-token.js')
      TokenScanner = module.TokenScanner
    } catch {
      try {
        const module = await import('../../../scan-token.js')
        TokenScanner = module.TokenScanner
      } catch (err) {
        throw new Error('Could not import TokenScanner. Run setup script first.')
      }
    }
    
    const scanner = new TokenScanner(rpcUrl, tokenAddress)

    // Get token info
    const tokenInfo = await scanner.getTokenInfo()
    if (!tokenInfo) {
      throw new Error('Failed to fetch token information')
    }

    // Update scan with token info
    const scan = activeScans.get(scanId)
    if (scan) {
      scan.tokenInfo = {
        ...tokenInfo,
        currentPriceUSD: scanner.currentPrice,
        address: tokenAddress,
      }
    }

    // Progress callback
    const progressCallback = (progress: any) => {
      const scan = activeScans.get(scanId)
      if (scan) {
        scan.progress = {
          ...progress,
          status: 'scanning',
          message: `Scanning blocks... ${progress.progress.toFixed(1)}%`,
        }
      }
    }

    // Scan transfers
    await scanner.scanTransfers(
      fromBlock || 0,
      'latest',
      null,
      true, // parallel
      progressCallback
    )

    // Get current balances
    await scanner.getCurrentBalances()

    // Calculate profitability
    const profitableWallets = await scanner.calculateProfitability(tokenInfo)

    // Format wallets for API response
    const formattedWallets = profitableWallets.slice(0, 50).map((w: any) => ({
      address: w.address,
      currentBalance: scanner.formatTokenAmount(w.currentBalance, tokenInfo.decimals),
      currentValueUSD: w.currentValueUSD.toFixed(2),
      totalProfitUSD: w.totalProfitUSD.toFixed(2),
      buyCount: w.buyCount,
      sellCount: w.sellCount,
      roi: w.costBasisUSD > 0 
        ? `${((w.totalProfitUSD / w.costBasisUSD) * 100).toFixed(2)}%`
        : 'N/A',
    }))

    // Store results
    const scan = activeScans.get(scanId)
    if (scan) {
      scan.wallets = formattedWallets
      scan.status = 'complete'
      scan.progress = {
        ...scan.progress,
        status: 'complete',
        message: 'Scan complete!',
        progress: 100,
      }
    }
  } catch (error: any) {
    const scan = activeScans.get(scanId)
    if (scan) {
      scan.status = 'error'
      scan.error = error.message
      scan.progress = {
        ...scan.progress,
        status: 'error',
        message: error.message,
      }
    }
  }
}

// Get scan status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const scanId = searchParams.get('scanId')

  if (!scanId) {
    return NextResponse.json({ error: 'Scan ID is required' }, { status: 400 })
  }

  const scan = activeScans.get(scanId)
  if (!scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: scan.status,
    progress: scan.progress,
    tokenInfo: scan.tokenInfo,
    wallets: scan.wallets,
    error: scan.error,
  })
}

