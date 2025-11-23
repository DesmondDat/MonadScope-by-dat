import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
import PriceService from './price-service.js';
import { RPCRotator } from './rpc-endpoints.js';

dotenv.config();

// Standard ERC20 ABI (minimal for balance and transfer events)
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

class TokenScanner {
  constructor(rpcUrl, tokenAddress) {
    this.rpcUrl = rpcUrl;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    this.tokenAddress = tokenAddress;
    this.priceService = new PriceService();
    this.wallets = new Map(); // address -> { buys: [], sells: [], currentBalance: 0n, totalSpent: 0n, totalReceived: 0n }
    this.currentPrice = null;
    this.chainId = null;
    this.rpcRotator = new RPCRotator();
  }

  async getTokenInfo() {
    try {
      const [name, symbol, decimals, totalSupply, network] = await Promise.all([
        this.tokenContract.name().catch(() => 'Unknown'),
        this.tokenContract.symbol().catch(() => 'UNKNOWN'),
        this.tokenContract.decimals(),
        this.tokenContract.totalSupply(),
        this.provider.getNetwork()
      ]);
      
      this.chainId = network.chainId.toString();
      
      // Fetch current price
      console.log('   Fetching current token price...');
      try {
        this.currentPrice = await this.priceService.getTokenPrice(
          this.tokenAddress,
          this.chainId,
          symbol
        );
        if (!this.currentPrice || this.currentPrice === 0) {
          console.warn('   ⚠️  Could not fetch price. USD calculations will show $0.00');
          console.warn('   💡 This is normal if CoinGecko doesn\'t support Monad tokens yet');
        }
      } catch (priceError) {
        console.warn(`   ⚠️  Price fetch error: ${priceError.message}`);
        this.currentPrice = 0;
      }
      
      return { name, symbol, decimals, totalSupply };
    } catch (error) {
      console.error('Error fetching token info:', error.message);
      return null;
    }
  }

  async findTokenCreationBlock() {
    try {
      console.log('   Finding token creation block...');
      const currentBlock = await this.provider.getBlockNumber();
      
      // Search backwards from current block in chunks
      // Look for the first Transfer event (mint to creator)
      const searchChunk = 10000;
      let foundBlock = null;
      
      // Start from a reasonable point (e.g., 1M blocks ago or current - 30 days worth)
      const blocksPerDay = 7200; // Approximate
      const daysToSearch = 30;
      const startSearch = Math.max(0, currentBlock - (blocksPerDay * daysToSearch));
      
      console.log(`   Searching from block ${startSearch} to ${currentBlock}...`);
      
      for (let endBlock = currentBlock; endBlock >= startSearch; endBlock -= searchChunk) {
        const fromBlock = Math.max(startSearch, endBlock - searchChunk);
        
        try {
          const filter = this.tokenContract.filters.Transfer();
          const events = await this.tokenContract.queryFilter(filter, fromBlock, endBlock);
          
          if (events.length > 0) {
            // Find the earliest block with a transfer
            const earliestEvent = events.reduce((earliest, event) => 
              event.blockNumber < earliest.blockNumber ? event : earliest
            );
            foundBlock = earliestEvent.blockNumber;
            console.log(`   ✅ Found first transfer at block ${foundBlock}`);
            break;
          }
        } catch (error) {
          // Continue searching
          continue;
        }
      }
      
      return foundBlock || startSearch;
    } catch (error) {
      console.warn(`   ⚠️  Could not find creation block: ${error.message}`);
      return null;
    }
  }

  async scanTransfers(fromBlock = 0, toBlock = 'latest', batchSize = null, useParallel = true, progressCallback = null) {
    console.log(`\n📡 Scanning transfers from block ${fromBlock} to ${toBlock}...`);
    
    const currentBlock = toBlock === 'latest' ? await this.provider.getBlockNumber() : toBlock;
    
    // Auto-adjust batch size based on block range
    // Note: Free tier RPCs (like Alchemy) often limit to 10 blocks
    if (!batchSize) {
      const blockRange = currentBlock - fromBlock;
      // Use smaller batches to work with free tier RPC limits
      if (blockRange > 1000000) {
        batchSize = 10; // Free tier limit
      } else if (blockRange > 100000) {
        batchSize = 10; // Free tier limit
      } else {
        batchSize = 10; // Free tier limit - safe default
      }
    }
    
    console.log(`   Using batch size: ${batchSize} blocks`);
    console.log(`   Parallel processing: ${useParallel ? 'Enabled' : 'Disabled'}`);
    console.log(`   💡 Note: Free tier RPCs may limit to 10 blocks per query.`);
    
    if (useParallel) {
      return await this.scanTransfersParallel(fromBlock, currentBlock, batchSize, progressCallback);
    } else {
      return await this.scanTransfersSequential(fromBlock, currentBlock, batchSize, progressCallback);
    }
  }

  async scanTransfersParallel(fromBlock, currentBlock, batchSize, progressCallback = null) {
    let totalEvents = 0;
    const totalBatches = Math.ceil((currentBlock - fromBlock) / batchSize);
    const maxConcurrent = 5; // Process 5 batches in parallel
    let processedBatches = 0;
    let errorCount = 0;
    const maxErrors = 10;
    
    console.log(`   Processing ${totalBatches} batches with up to ${maxConcurrent} parallel queries...\n`);
    
    // Create all batch ranges
    const batches = [];
    for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += batchSize) {
      const endBlock = Math.min(startBlock + batchSize - 1, currentBlock);
      batches.push({ startBlock, endBlock });
    }
    
    // Process batches in parallel chunks
    for (let i = 0; i < batches.length; i += maxConcurrent) {
      const batchChunk = batches.slice(i, i + maxConcurrent);
      
      const results = await Promise.allSettled(
        batchChunk.map(async ({ startBlock, endBlock }) => {
          try {
            const filter = this.tokenContract.filters.Transfer();
            const queryPromise = this.tokenContract.queryFilter(filter, startBlock, endBlock);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Query timeout')), 30000)
            );
            
            const events = await Promise.race([queryPromise, timeoutPromise]);
            
            // Process events
            for (const event of events) {
              try {
                const { from, to, value } = event.args;
                
                if (from === ethers.ZeroAddress) {
                  this.updateWallet(to, 'buy', value, event.blockNumber, true);
                  continue;
                }
                
                if (to === ethers.ZeroAddress) {
                  this.updateWallet(from, 'sell', value, event.blockNumber, true);
                  continue;
                }
                
                this.updateWallet(from, 'sell', value, event.blockNumber);
                this.updateWallet(to, 'buy', value, event.blockNumber);
              } catch (eventError) {
                // Skip bad events
              }
            }
            
            return { success: true, events: events.length, startBlock, endBlock };
          } catch (error) {
            return { success: false, error: error.message, startBlock, endBlock };
          }
        })
      );
      
      // Process results
      for (const result of results) {
        processedBatches++;
        if (result.status === 'fulfilled' && result.value.success) {
          totalEvents += result.value.events;
          const progress = ((processedBatches / totalBatches) * 100);
          if (result.value.events > 0 || processedBatches % 100 === 0) {
            console.log(`   [${progress.toFixed(1)}%] Blocks ${result.value.startBlock}-${result.value.endBlock}: ${result.value.events} events (Total: ${totalEvents})`);
          }
          
          // Call progress callback if provided
          if (progressCallback) {
            progressCallback({
              progress,
              currentBlock: result.value.endBlock,
              totalBlocks: currentBlock - fromBlock,
              eventsFound: totalEvents,
              walletsTracked: this.wallets.size,
              status: 'scanning',
            });
          }
          
          errorCount = 0;
        } else {
          errorCount++;
          if (errorCount <= 5) {
            const error = result.status === 'fulfilled' ? result.value.error : result.reason?.message || 'Unknown error';
            console.warn(`   ⚠️  Error in batch: ${error}`);
          }
        }
      }
      
      // Small delay between parallel chunks to avoid rate limiting
      if (i + maxConcurrent < batches.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (errorCount >= maxErrors) {
        console.error(`\n❌ Too many errors (${errorCount}). Stopping scan.`);
        break;
      }
    }
    
    const lastProcessed = batches[Math.min(processedBatches - 1, batches.length - 1)];
    const processedBlocks = lastProcessed ? lastProcessed.endBlock : fromBlock;
    
    console.log(`\n✅ Scan complete! Processed up to block ${processedBlocks}`);
    console.log(`   Total events found: ${totalEvents}`);
    console.log(`   Total wallets tracked: ${this.wallets.size}`);
  }

  async scanTransfersSequential(fromBlock, currentBlock, batchSize) {
    let processedBlocks = fromBlock;
    let totalEvents = 0;
    let errorCount = 0;
    const maxErrors = 5;
    
    for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += batchSize) {
      const endBlock = Math.min(startBlock + batchSize - 1, currentBlock);
      
      try {
        const progress = ((endBlock - fromBlock) / (currentBlock - fromBlock) * 100).toFixed(1);
        console.log(`   Processing blocks ${startBlock} to ${endBlock} (${progress}%)...`);
        
        const filter = this.tokenContract.filters.Transfer();
        const queryPromise = this.tokenContract.queryFilter(filter, startBlock, endBlock);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 60000)
        );
        
        const events = await Promise.race([queryPromise, timeoutPromise]);
        
        for (const event of events) {
          try {
            const { from, to, value } = event.args;
            
            if (from === ethers.ZeroAddress) {
              this.updateWallet(to, 'buy', value, event.blockNumber, true);
              continue;
            }
            
            if (to === ethers.ZeroAddress) {
              this.updateWallet(from, 'sell', value, event.blockNumber, true);
              continue;
            }
            
            this.updateWallet(from, 'sell', value, event.blockNumber);
            this.updateWallet(to, 'buy', value, event.blockNumber);
          } catch (eventError) {
            // Skip bad events
          }
        }
        
        processedBlocks = endBlock;
        totalEvents += events.length;
        errorCount = 0;
        console.log(`   ✅ Processed ${events.length} transfer events (Total: ${totalEvents})`);
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        errorCount++;
        console.error(`   ⚠️  Error processing blocks ${startBlock}-${endBlock}: ${error.message}`);
        
        if (errorCount >= maxErrors) {
          console.error(`\n❌ Too many errors (${errorCount}). Stopping scan.`);
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * errorCount));
      }
    }
    
    console.log(`\n✅ Scan complete! Processed up to block ${processedBlocks}`);
    console.log(`   Total events found: ${totalEvents}`);
    console.log(`   Total wallets tracked: ${this.wallets.size}`);
  }

  updateWallet(address, type, amount, blockNumber, isMintOrBurn = false) {
    if (!this.wallets.has(address)) {
      this.wallets.set(address, {
        address,
        buys: [],
        sells: [],
        currentBalance: 0n,
        totalSpent: 0n,
        totalReceived: 0n,
        totalSpentUSD: 0,
        totalReceivedUSD: 0,
        firstSeen: blockNumber,
        lastSeen: blockNumber
      });
    }
    
    const wallet = this.wallets.get(address);
    wallet.lastSeen = blockNumber;
    
    if (type === 'buy') {
      wallet.buys.push({ amount, blockNumber, isMintOrBurn });
      wallet.currentBalance += amount;
      if (!isMintOrBurn) {
        wallet.totalSpent += amount;
      }
    } else if (type === 'sell') {
      wallet.sells.push({ amount, blockNumber, isMintOrBurn });
      wallet.currentBalance -= amount;
      if (!isMintOrBurn) {
        wallet.totalReceived += amount;
      }
    }
  }

  async getCurrentBalances() {
    console.log('\n💰 Fetching current balances for all wallets...');
    const addresses = Array.from(this.wallets.keys());
    let fetched = 0;
    let errors = 0;
    
    for (const address of addresses) {
      try {
        const balance = await this.tokenContract.balanceOf(address);
        this.wallets.get(address).currentBalance = balance;
        fetched++;
        
        if (fetched % 100 === 0) {
          console.log(`   Fetched ${fetched}/${addresses.length} balances...`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        errors++;
        if (errors <= 5) {
          console.warn(`   ⚠️  Error fetching balance for ${address}: ${error.message}`);
        }
        // Continue with next address
      }
    }
    
    console.log(`✅ Fetched ${fetched}/${addresses.length} current balances`);
    if (errors > 0) {
      console.log(`   ⚠️  ${errors} errors encountered (some wallets may have zero balance)`);
    }
  }

  async calculateProfitability(tokenInfo) {
    const profitableWallets = [];
    const price = this.currentPrice || 0;
    
    console.log(`   Using token price: $${price.toFixed(6)}`);
    
    for (const wallet of this.wallets.values()) {
      // Skip wallets with no activity
      if (wallet.buys.length === 0 && wallet.sells.length === 0) continue;
      
      // Calculate metrics
      const totalBought = wallet.buys.reduce((sum, buy) => sum + buy.amount, 0n);
      const totalSold = wallet.sells.reduce((sum, sell) => sum + sell.amount, 0n);
      const holdings = wallet.currentBalance;
      
      // Convert to numbers for USD calculations
      const totalBoughtNum = Number(ethers.formatUnits(totalBought, tokenInfo.decimals));
      const totalSoldNum = Number(ethers.formatUnits(totalSold, tokenInfo.decimals));
      const holdingsNum = Number(ethers.formatUnits(holdings, tokenInfo.decimals));
      
      // Calculate USD values (using current price as approximation)
      // In production, you'd want to fetch historical prices for each transaction
      const costBasisUSD = totalBoughtNum * price;
      const realizedValueUSD = totalSoldNum * price;
      const currentValueUSD = holdingsNum * price;
      
      // Calculate profits
      const realizedProfitUSD = realizedValueUSD - (totalSoldNum / (totalBoughtNum || 1)) * costBasisUSD;
      const unrealizedProfitUSD = currentValueUSD - (holdingsNum / (totalBoughtNum || 1)) * costBasisUSD;
      const totalProfitUSD = realizedProfitUSD + unrealizedProfitUSD;
      
      // Net tokens
      const netTokens = holdings + totalSold - totalBought;
      
      profitableWallets.push({
        address: wallet.address,
        currentBalance: holdings, // Keep as BigInt for calculations
        totalBought, // Keep as BigInt
        totalSold, // Keep as BigInt
        holdings, // Keep as BigInt
        netTokens, // Keep as BigInt
        // Token amounts
        realizedProfit: totalSold > totalBought ? totalSold - totalBought : 0n,
        costBasis: totalBought - totalSold,
        // USD values
        costBasisUSD,
        realizedValueUSD,
        currentValueUSD,
        realizedProfitUSD,
        unrealizedProfitUSD,
        totalProfitUSD,
        buyCount: wallet.buys.length,
        sellCount: wallet.sells.length,
        firstSeen: Number(wallet.firstSeen), // Convert to number for JSON
        lastSeen: Number(wallet.lastSeen), // Convert to number for JSON
        // Profitability score (based on USD profit)
        score: totalProfitUSD
      });
    }
    
    // Sort by total profit USD
    return profitableWallets.sort((a, b) => b.totalProfitUSD - a.totalProfitUSD);
  }

  formatTokenAmount(amount, decimals) {
    return ethers.formatUnits(amount, decimals);
  }

  async generateReport(tokenInfo, profitableWallets, topN = 50) {
    const report = {
      token: {
        address: this.tokenAddress,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        totalSupply: tokenInfo.totalSupply.toString(),
        currentPriceUSD: this.currentPrice
      },
      scanSummary: {
        totalWallets: this.wallets.size,
        profitableWallets: profitableWallets.length,
        scanDate: new Date().toISOString(),
        chainId: this.chainId
      },
      topProfitableWallets: profitableWallets.slice(0, topN).map(w => ({
        address: w.address,
        currentBalance: this.formatTokenAmount(w.currentBalance, tokenInfo.decimals),
        currentValueUSD: w.currentValueUSD.toFixed(2),
        totalBought: this.formatTokenAmount(w.totalBought, tokenInfo.decimals),
        totalSold: this.formatTokenAmount(w.totalSold, tokenInfo.decimals),
        netTokens: this.formatTokenAmount(w.netTokens, tokenInfo.decimals),
        costBasisUSD: w.costBasisUSD.toFixed(2),
        realizedProfitUSD: w.realizedProfitUSD.toFixed(2),
        unrealizedProfitUSD: w.unrealizedProfitUSD.toFixed(2),
        totalProfitUSD: w.totalProfitUSD.toFixed(2),
        profitabilityScore: w.score.toFixed(2),
        buyCount: w.buyCount,
        sellCount: w.sellCount,
        firstSeen: w.firstSeen.toString(), // Convert BigInt to string
        lastSeen: w.lastSeen.toString() // Convert BigInt to string
      }))
    };
    
    // Save to file (handle BigInt serialization)
    const filename = `profitable-wallets-${tokenInfo.symbol}-${Date.now()}.json`;
    // Convert BigInt values to strings for JSON serialization
    const reportString = JSON.stringify(report, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);
    fs.writeFileSync(filename, reportString);
    console.log(`\n💾 Report saved to: ${filename}`);
    
    // Print top wallets
    console.log(`\n📊 Top ${Math.min(topN, profitableWallets.length)} Profitable Wallets:\n`);
    console.log('Rank | Address | Balance | Current Value | Total Profit | ROI');
    console.log('-'.repeat(110));
    
    profitableWallets.slice(0, topN).forEach((wallet, index) => {
      const roi = wallet.costBasisUSD > 0 
        ? ((wallet.totalProfitUSD / wallet.costBasisUSD) * 100).toFixed(2) + '%'
        : 'N/A';
      
      console.log(
        `${(index + 1).toString().padStart(4)} | ${wallet.address.slice(0, 10)}...${wallet.address.slice(-8)} | ` +
        `${this.formatTokenAmount(wallet.currentBalance, tokenInfo.decimals).padStart(12)} | ` +
        `$${wallet.currentValueUSD.toFixed(2).padStart(13)} | ` +
        `$${wallet.totalProfitUSD.toFixed(2).padStart(12)} | ` +
        `${roi.padStart(6)}`
      );
    });
    
    // Summary statistics
    const totalProfit = profitableWallets.reduce((sum, w) => sum + w.totalProfitUSD, 0);
    const avgProfit = profitableWallets.length > 0 ? totalProfit / profitableWallets.length : 0;
    console.log(`\n📈 Summary:`);
    console.log(`   Total Profit (all wallets): $${totalProfit.toFixed(2)}`);
    console.log(`   Average Profit: $${avgProfit.toFixed(2)}`);
    console.log(`   Top Wallet Profit: $${profitableWallets[0]?.totalProfitUSD.toFixed(2) || '0.00'}`);
    
    return report;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node scan-token.js <TOKEN_ADDRESS> [RPC_URL] [FROM_BLOCK] [TO_BLOCK] [--no-parallel]');
    console.log('\nExample:');
    console.log('  node scan-token.js 0x1234...5678 https://rpc.monad.xyz 0 latest');
    console.log('  node scan-token.js 0x1234...5678 --no-parallel  # Disable parallel processing');
    process.exit(1);
  }
  
  const tokenAddress = args[0];
  let rpcUrl = args[1]?.startsWith('http') ? args[1] : process.env.MONAD_RPC_URL;
  
  // If no RPC specified, use first available from free endpoints
  if (!rpcUrl) {
    const { FREE_MONAD_RPC_ENDPOINTS } = await import('./rpc-endpoints.js');
    rpcUrl = FREE_MONAD_RPC_ENDPOINTS[0] || 'https://rpc.monad.xyz';
    console.log(`   Using free RPC endpoint: ${rpcUrl}`);
  }
  
  // Parse arguments (skip RPC if it was provided)
  const nonRpcArgs = args.filter((arg, i) => i === 0 || !arg.startsWith('http'));
  const useParallel = !args.includes('--no-parallel');
  const fromBlock = nonRpcArgs[1] ? parseInt(nonRpcArgs[1]) : null;
  const toBlock = nonRpcArgs[2] || 'latest';
  
    console.log('🚀 Monad Token Scanner');
    console.log('='.repeat(50));
    console.log(`Token Address: ${tokenAddress}`);
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Scan Range: Block ${fromBlock === null ? 'auto-detect' : fromBlock} to ${toBlock}`);
    console.log('\n💡 Tip: For large block ranges, consider specifying a FROM_BLOCK to speed up scanning');
  
  try {
    const scanner = new TokenScanner(rpcUrl, tokenAddress);
    
    // Get token info
    console.log('\n📋 Fetching token information...');
    const tokenInfo = await scanner.getTokenInfo();
    if (!tokenInfo) {
      console.error('❌ Failed to fetch token information. Check the contract address.');
      process.exit(1);
    }
    
    console.log(`✅ Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
    console.log(`   Decimals: ${tokenInfo.decimals}`);
    console.log(`   Total Supply: ${ethers.formatUnits(tokenInfo.totalSupply, tokenInfo.decimals)}`);
    console.log(`   Current Price: $${scanner.currentPrice?.toFixed(6) || 'N/A'}`);
    
    // If fromBlock not specified, try to find token creation block
    if (fromBlock === null) {
      const creationBlock = await scanner.findTokenCreationBlock();
      if (creationBlock) {
        fromBlock = Number(creationBlock);
        console.log(`\n📦 Starting scan from token creation block: ${fromBlock}`);
      } else {
        fromBlock = 0;
        console.log(`\n📦 Starting scan from genesis block (this may take a while)`);
      }
    } else {
      console.log(`\n📦 Starting scan from block: ${fromBlock}`);
    }
    
    // Scan transfers (with parallel processing by default)
    await scanner.scanTransfers(fromBlock, toBlock, null, useParallel);
    
    // Get current balances (skip if too many wallets to avoid timeout)
    if (scanner.wallets.size > 10000) {
      console.log(`\n⚠️  Too many wallets (${scanner.wallets.size}). Skipping balance fetch to save time.`);
      console.log('   You can manually fetch balances later if needed.');
    } else {
      await scanner.getCurrentBalances();
    }
    
    // Calculate profitability
    console.log('\n📈 Calculating profitability with USD values...');
    const profitableWallets = await scanner.calculateProfitability(tokenInfo);
    
    // Generate report
    await scanner.generateReport(tokenInfo, profitableWallets, 50);
    
    console.log('\n✅ Scan complete!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for use in other modules
export { TokenScanner };

// Run main if this file is executed directly
// Check if we're being run as a script (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
                     process.argv[1]?.endsWith('scan-token.js');

if (isMainModule) {
  main();
}

