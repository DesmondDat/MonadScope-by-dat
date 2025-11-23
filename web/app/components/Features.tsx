export default function Features() {
  const features = [
    {
      icon: '⚡',
      title: 'Real-Time Scanning',
      description: 'Watch wallets update in real-time as transactions happen on-chain',
    },
    {
      icon: '💰',
      title: 'USD Profit Tracking',
      description: 'Calculate profits in USD with automatic price fetching from CoinGecko',
    },
    {
      icon: '📊',
      title: 'Detailed Analytics',
      description: 'See buy/sell patterns, ROI, and profitability scores for each wallet',
    },
    {
      icon: '🔍',
      title: 'Fast & Efficient',
      description: 'Parallel processing and optimized queries for quick results',
    },
    {
      icon: '🌐',
      title: 'Multiple RPC Support',
      description: 'Automatic fallback to multiple free RPC endpoints',
    },
    {
      icon: '📈',
      title: 'Export Reports',
      description: 'Download detailed JSON reports with all wallet data',
    },
  ]

  return (
    <section id="features" className="mt-20">
      <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <div
            key={index}
            className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700 hover:border-purple-500 transition-all"
          >
            <div className="text-4xl mb-4">{feature.icon}</div>
            <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
            <p className="text-gray-400">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

