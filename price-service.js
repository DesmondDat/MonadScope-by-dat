import dotenv from 'dotenv';

dotenv.config();

// Price cache to avoid excessive API calls
const priceCache = new Map();
const CACHE_DURATION = 60000; // 1 minute cache

class PriceService {
  constructor() {
    this.apiKey = process.env.COINGECKO_API_KEY || null;
    this.baseUrl = 'https://api.coingecko.com/api/v3';
  }

  /**
   * Get token price in USD
   * Supports multiple methods:
   * 1. CoinGecko API (by contract address)
   * 2. CoinGecko API (by symbol - fallback)
   * 3. Custom price source (if configured)
   */
  async getTokenPrice(tokenAddress, chainId = 'monad', symbol = null) {
    const cacheKey = `${tokenAddress}-${chainId}`;
    const cached = priceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.price;
    }

    try {
      // Try CoinGecko by contract address first
      let price = await this.getPriceFromCoinGecko(tokenAddress, chainId);
      
      // Fallback to symbol search if contract lookup fails
      if (!price && symbol) {
        price = await this.getPriceBySymbol(symbol);
      }

      if (price) {
        priceCache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }

      console.warn(`⚠️  Could not fetch price for ${tokenAddress}. Using $0.00`);
      return 0;
    } catch (error) {
      console.error(`Error fetching price: ${error.message}`);
      return 0;
    }
  }

  async getPriceFromCoinGecko(tokenAddress, chainId = 'monad') {
    try {
      // Map chain IDs to CoinGecko platform IDs
      const platformMap = {
        'monad': 'monad',
        '143': 'monad', // Monad mainnet chain ID
        'ethereum': 'ethereum',
        '1': 'ethereum',
        'sepolia': 'ethereum', // Testnet
      };

      // Handle numeric chain IDs
      const chainIdStr = chainId.toString();
      const platform = platformMap[chainIdStr] || platformMap[chainId] || 'ethereum';
      
      // Note: CoinGecko may not support Monad yet - will gracefully fall back
      const url = `${this.baseUrl}/simple/token_price/${platform}?contract_addresses=${tokenAddress.toLowerCase()}&vs_currencies=usd`;
      
      const headers = {};
      if (this.apiKey) {
        headers['x-cg-demo-api-key'] = this.apiKey;
      }

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        if (response.status === 429) {
          console.warn('⚠️  Rate limited by CoinGecko. Consider adding API key.');
          return null;
        }
        if (response.status === 404) {
          // CoinGecko doesn't support this platform yet
          console.warn(`⚠️  CoinGecko doesn't support platform "${platform}" yet. Price will be $0.00`);
          return null;
        }
        // Don't throw, just return null for other errors
        console.warn(`⚠️  CoinGecko API returned status ${response.status}`);
        return null;
      }

      const data = await response.json();
      
      // Check if response is empty or has error
      if (!data || Object.keys(data).length === 0) {
        return null;
      }
      
      const priceData = data[tokenAddress.toLowerCase()];
      
      return priceData?.usd || null;
    } catch (error) {
      console.error(`CoinGecko API error: ${error.message}`);
      return null;
    }
  }

  async getPriceBySymbol(symbol) {
    try {
      const url = `${this.baseUrl}/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`;
      
      const headers = {};
      if (this.apiKey) {
        headers['x-cg-demo-api-key'] = this.apiKey;
      }

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const priceData = data[symbol.toLowerCase()];
      
      return priceData?.usd || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get historical price at a specific block (approximate)
   * Note: This is a simplified version. For accurate historical prices,
   * you'd need to query DEX pools or use a more sophisticated price oracle
   */
  async getHistoricalPrice(tokenAddress, blockNumber, chainId = 'monad') {
    // For now, return current price
    // In production, you'd query historical price data
    return await this.getTokenPrice(tokenAddress, chainId);
  }

  /**
   * Get native token price (e.g., MON for Monad, ETH for Ethereum)
   */
  async getNativeTokenPrice(chainId = 'monad') {
    const nativeTokenMap = {
      'monad': 'monad',
      'ethereum': 'ethereum',
      '1': 'ethereum',
    };

    const tokenId = nativeTokenMap[chainId] || 'ethereum';
    
    try {
      const url = `${this.baseUrl}/simple/price?ids=${tokenId}&vs_currencies=usd`;
      
      const headers = {};
      if (this.apiKey) {
        headers['x-cg-demo-api-key'] = this.apiKey;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) return null;

      const data = await response.json();
      return data[tokenId]?.usd || null;
    } catch (error) {
      console.error(`Error fetching native token price: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear price cache
   */
  clearCache() {
    priceCache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: priceCache.size,
      entries: Array.from(priceCache.keys())
    };
  }
}

export default PriceService;

