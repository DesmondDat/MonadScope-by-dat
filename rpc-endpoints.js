// Free Monad RPC Endpoints
// These are public/free endpoints that may have rate limits
// For production use, consider getting API keys from these providers

export const FREE_MONAD_RPC_ENDPOINTS = [
  // Public/Free endpoints (no API key required)
  'https://rpc.monad.xyz',
  'https://monad-rpc.publicnode.com',
  
  // Ankr (may require free account)
  'https://rpc.ankr.com/monad',
  
  // Chainstack (may require free account)
  // 'https://monad-mainnet.chainstack.com',
  
  // dRPC (free tier available)
  // 'https://monad.drpc.org',
  
  // Note: Add your own RPC endpoints from .env
  process.env.MONAD_RPC_URL,
].filter(Boolean); // Remove any undefined values

// RPC endpoint with rotation support
export class RPCRotator {
  constructor(endpoints) {
    this.endpoints = endpoints || FREE_MONAD_RPC_ENDPOINTS;
    this.currentIndex = 0;
    this.failedEndpoints = new Set();
  }

  getNextEndpoint() {
    // Try to find a non-failed endpoint
    let attempts = 0;
    while (attempts < this.endpoints.length) {
      const endpoint = this.endpoints[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
      
      if (!this.failedEndpoints.has(endpoint)) {
        return endpoint;
      }
      attempts++;
    }
    
    // All endpoints failed, reset and try again
    this.failedEndpoints.clear();
    return this.endpoints[0];
  }

  markFailed(endpoint) {
    this.failedEndpoints.add(endpoint);
  }

  markSuccess(endpoint) {
    this.failedEndpoints.delete(endpoint);
  }

  getAvailableEndpoints() {
    return this.endpoints.filter(e => !this.failedEndpoints.has(e));
  }
}

export default FREE_MONAD_RPC_ENDPOINTS;

