/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    MONAD_RPC_URL: process.env.MONAD_RPC_URL,
    COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
  },
  // Allow longer API routes for scanning
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig

