'use client'

import { useState, useRef, useEffect } from 'react'

interface Wallet {
  address: string
  currentBalance: string
  currentValueUSD: string
  totalProfitUSD: string
  buyCount: number
  sellCount: number
  roi: string
}

interface ScanProgress {
  progress: number
  currentBlock: number
  totalBlocks: number
  eventsFound: number
  walletsTracked: number
  status: 'idle' | 'scanning' | 'calculating' | 'complete' | 'error'
  message: string
}

export default function TokenScanner() {
  const [tokenAddress, setTokenAddress] = useState('')
  const [fromBlock, setFromBlock] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [progress, setProgress] = useState<ScanProgress>({
    progress: 0,
    currentBlock: 0,
    totalBlocks: 0,
    eventsFound: 0,
    walletsTracked: 0,
    status: 'idle',
    message: '',
  })
  const [tokenInfo, setTokenInfo] = useState<any>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  const startScan = async () => {
    if (!tokenAddress) {
      alert('Please enter a token address')
      return
    }

    setIsScanning(true)
    setWallets([])
    setProgress({
      progress: 0,
      currentBlock: 0,
      totalBlocks: 0,
      eventsFound: 0,
      walletsTracked: 0,
      status: 'scanning',
      message: 'Starting scan...',
    })

    try {
      // Start the scan via API
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenAddress,
          fromBlock: fromBlock || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start scan')
      }

      const { scanId } = await response.json()

      // Connect to Server-Sent Events for real-time updates
      const eventSource = new EventSource(`/api/scan/${scanId}/stream`)
      eventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'progress') {
          setProgress({
            progress: data.progress || 0,
            currentBlock: data.currentBlock || 0,
            totalBlocks: data.totalBlocks || 0,
            eventsFound: data.eventsFound || 0,
            walletsTracked: data.walletsTracked || 0,
            status: data.status || 'scanning',
            message: data.message || '',
          })
        } else if (data.type === 'tokenInfo') {
          setTokenInfo(data.data)
        } else if (data.type === 'wallets') {
          setWallets(data.data || [])
          setProgress((prev) => ({ ...prev, status: 'complete' }))
        } else if (data.type === 'error') {
          setProgress((prev) => ({
            ...prev,
            status: 'error',
            message: data.message || 'An error occurred',
          }))
          setIsScanning(false)
          eventSource.close()
        } else if (data.type === 'complete') {
          setIsScanning(false)
          eventSource.close()
        }
      }

      eventSource.onerror = () => {
        setProgress((prev) => ({
          ...prev,
          status: 'error',
          message: 'Connection lost',
        }))
        setIsScanning(false)
        eventSource.close()
      }
    } catch (error: any) {
      setProgress((prev) => ({
        ...prev,
        status: 'error',
        message: error.message || 'Failed to start scan',
      }))
      setIsScanning(false)
    }
  }

  const stopScan = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsScanning(false)
    setProgress((prev) => ({ ...prev, status: 'idle' }))
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700 shadow-2xl">
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Token Contract Address</label>
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 bg-slate-900 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500 text-white"
            disabled={isScanning}
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            From Block (optional - leave empty to auto-detect)
          </label>
          <input
            type="number"
            value={fromBlock}
            onChange={(e) => setFromBlock(e.target.value)}
            placeholder="Auto-detect"
            className="w-full px-4 py-3 bg-slate-900 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500 text-white"
            disabled={isScanning}
          />
        </div>

        <div className="flex gap-4">
          <button
            onClick={isScanning ? stopScan : startScan}
            disabled={!tokenAddress && !isScanning}
            className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all ${
              isScanning
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isScanning ? 'Stop Scan' : 'Start Scan'}
          </button>
        </div>

        {/* Progress */}
        {progress.status !== 'idle' && (
          <div className="mt-6 p-4 bg-slate-900/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{progress.message || 'Scanning...'}</span>
              <span className="text-sm text-gray-400">
                {progress.status === 'complete' ? 'Complete' : `${progress.progress.toFixed(1)}%`}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
              <div
                className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.progress}%` }}
              ></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-400">
              <div>
                <span className="block">Current Block</span>
                <span className="text-white font-medium">{progress.currentBlock.toLocaleString()}</span>
              </div>
              <div>
                <span className="block">Events Found</span>
                <span className="text-white font-medium">{progress.eventsFound.toLocaleString()}</span>
              </div>
              <div>
                <span className="block">Wallets</span>
                <span className="text-white font-medium">{progress.walletsTracked.toLocaleString()}</span>
              </div>
              <div>
                <span className="block">Status</span>
                <span className="text-white font-medium capitalize">{progress.status}</span>
              </div>
            </div>
          </div>
        )}

        {/* Token Info */}
        {tokenInfo && (
          <div className="mt-6 p-4 bg-slate-900/50 rounded-lg">
            <h3 className="font-semibold mb-2">Token Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Name</span>
                <p className="text-white font-medium">{tokenInfo.name}</p>
              </div>
              <div>
                <span className="text-gray-400">Symbol</span>
                <p className="text-white font-medium">{tokenInfo.symbol}</p>
              </div>
              <div>
                <span className="text-gray-400">Price</span>
                <p className="text-white font-medium">
                  {tokenInfo.currentPriceUSD ? `$${parseFloat(tokenInfo.currentPriceUSD).toFixed(6)}` : 'N/A'}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Total Supply</span>
                <p className="text-white font-medium">{tokenInfo.totalSupply}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results Table */}
        {wallets.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4">Top Profitable Wallets</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-900/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold">Rank</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Address</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Balance</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Current Value</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Total Profit</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">ROI</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((wallet, index) => (
                    <tr
                      key={wallet.address}
                      className="border-t border-gray-700 hover:bg-slate-900/30 transition"
                    >
                      <td className="px-4 py-3 text-sm">#{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-mono">
                        {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">{wallet.currentBalance}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-400">
                        ${parseFloat(wallet.currentValueUSD).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-green-400">
                        ${parseFloat(wallet.totalProfitUSD).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">{wallet.roi}</td>
                      <td className="px-4 py-3 text-sm text-center text-gray-400">
                        {wallet.buyCount} buys / {wallet.sellCount} sells
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

