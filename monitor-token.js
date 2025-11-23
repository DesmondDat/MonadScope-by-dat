import { ethers } from 'ethers';
import dotenv from 'dotenv';
import PriceService from './price-service.js';
import fs from 'fs';

dotenv.config();

// Standard ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

class TokenMonitor {
  constructor(rpcUrl, tokenAddress, options = {}) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    this.tokenAddress = tokenAddress;
    this.priceService = new PriceService();
    this.wallets = new Map();
    this.options = {
      updateInterval: options.updateInterval || 30000, // 30 seconds
      priceUpdateInterval: options.priceUpdateInterval || 60000, // 1 minute
      minProfitUSD: options.minProfitUSD || 0,
      alertThreshold: options.alertThreshold || 1000, // Alert if profit > $1000
      logFile: options.logFile || null,
      ...options
    };
    this.isRunning = false;
    this.lastBlock = null;
    this.currentPrice = null;
    this.tokenInfo = null;
    this.stats = {
      totalTransfers: 0,
      newWallets: 0,
      profitableWallets: 0,
      startTime: Date.now()
    };
  }

  async initialize() {
    console.log('🔧 Initializing monitor...');
    
    // Get token info
    try {
      const [name, symbol, decimals] = await Promise.all([
        this.tokenContract.name().catch(() => 'Unknown'),
        this.tokenContract.symbol().catch(() => 'UNKNOWN'),
        this.tokenContract.decimals()
      ]);
      
      this.tokenInfo = { name, symbol, decimals };
      console.log(`✅ Token: ${name} (${symbol})`);
      
      // Get initial price
      this.currentPrice = await this.priceService.getTokenPrice(
        this.tokenAddress,
        'monad',
        symbol
      );
      console.log(`💰 Current Price: $${this.currentPrice?.toFixed(6) || 'N/A'}`);
      
      // Get current block
      this.lastBlock = await this.provider.getBlockNumber();
      console.log(`📦 Starting from block: ${this.lastBlock}`);
      
    } catch (error) {
      console.error('❌ Initialization error:', error.message);
      throw error;
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  Monitor is already running');
      return;
    }

    await this.initialize();
    this.isRunning = true;

    console.log('\n🚀 Starting real-time monitoring...');
    console.log(`   Update interval: ${this.options.updateInterval / 1000}s`);
    console.log(`   Price update interval: ${this.options.priceUpdateInterval / 1000}s`);
    console.log(`   Min profit filter: $${this.options.minProfitUSD}`);
    console.log('   Press Ctrl+C to stop\n');

    // Set up event listener for new transfers
    this.setupEventListener();

    // Start periodic updates
    this.startPriceUpdates();
    this.startPeriodicReports();

    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  setupEventListener() {
    // Listen for new Transfer events
    this.tokenContract.on('Transfer', async (from, to, value, event) => {
      try {
        await this.handleTransfer(from, to, value, event);
      } catch (error) {
        console.error('Error handling transfer:', error.message);
      }
    });

    console.log('👂 Listening for new Transfer events...');
  }

  async handleTransfer(from, to, value, event) {
    this.stats.totalTransfers++;
    
    const blockNumber = event.log.blockNumber;
    const timestamp = Date.now();

    // Update wallet data
    if (from !== ethers.ZeroAddress) {
      this.updateWallet(from, 'sell', value, blockNumber, timestamp);
    }
    if (to !== ethers.ZeroAddress) {
      const isNew = !this.wallets.has(to);
      this.updateWallet(to, 'buy', value, blockNumber, timestamp);
      if (isNew) {
        this.stats.newWallets++;
        console.log(`🆕 New wallet detected: ${to.slice(0, 10)}...${to.slice(-8)}`);
      }
    }

    // Log significant transfers
    const amount = Number(ethers.formatUnits(value, this.tokenInfo.decimals));
    const usdValue = amount * (this.currentPrice || 0);
    
    if (usdValue > 100) { // Log transfers > $100
      this.log(`💸 Transfer: ${amount.toFixed(4)} ${this.tokenInfo.symbol} ($${usdValue.toFixed(2)}) from ${from.slice(0, 10)}... to ${to.slice(0, 10)}...`);
    }

    // Check for profitable wallets
    await this.checkProfitableWallets();
  }

  updateWallet(address, type, amount, blockNumber, timestamp) {
    if (!this.wallets.has(address)) {
      this.wallets.set(address, {
        address,
        buys: [],
        sells: [],
        currentBalance: 0n,
        totalSpentUSD: 0,
        totalReceivedUSD: 0,
        firstSeen: blockNumber,
        lastSeen: blockNumber,
        lastUpdated: timestamp
      });
    }

    const wallet = this.wallets.get(address);
    wallet.lastSeen = blockNumber;
    wallet.lastUpdated = timestamp;

    const amountNum = Number(ethers.formatUnits(amount, this.tokenInfo.decimals));
    const usdValue = amountNum * (this.currentPrice || 0);

    if (type === 'buy') {
      wallet.buys.push({ amount, amountUSD: usdValue, blockNumber, timestamp });
      wallet.currentBalance += amount;
      wallet.totalSpentUSD += usdValue;
    } else if (type === 'sell') {
      wallet.sells.push({ amount, amountUSD: usdValue, blockNumber, timestamp });
      wallet.currentBalance -= amount;
      wallet.totalReceivedUSD += usdValue;
    }
  }

  async checkProfitableWallets() {
    // Update current balances for active wallets
    const activeWallets = Array.from(this.wallets.values())
      .filter(w => w.lastUpdated > Date.now() - 300000); // Last 5 minutes

    for (const wallet of activeWallets) {
      try {
        const balance = await this.tokenContract.balanceOf(wallet.address);
        wallet.currentBalance = balance;
        
        const balanceNum = Number(ethers.formatUnits(balance, this.tokenInfo.decimals));
        const currentValueUSD = balanceNum * (this.currentPrice || 0);
        const costBasisUSD = wallet.totalSpentUSD - wallet.totalReceivedUSD;
        const profitUSD = wallet.totalReceivedUSD - wallet.totalSpentUSD + currentValueUSD;

        if (profitUSD > this.options.alertThreshold) {
          this.alertProfitableWallet(wallet, profitUSD, currentValueUSD);
        }
      } catch (error) {
        // Skip errors
      }
    }
  }

  alertProfitableWallet(wallet, profitUSD, currentValueUSD) {
    const message = `🚨 PROFITABLE WALLET DETECTED!\n` +
      `   Address: ${wallet.address}\n` +
      `   Profit: $${profitUSD.toFixed(2)}\n` +
      `   Current Holdings: $${currentValueUSD.toFixed(2)}\n` +
      `   Buys: ${wallet.buys.length} | Sells: ${wallet.sells.length}`;
    
    console.log(`\n${message}\n`);
    this.log(message);
  }

  startPriceUpdates() {
    setInterval(async () => {
      try {
        const newPrice = await this.priceService.getTokenPrice(
          this.tokenAddress,
          'monad',
          this.tokenInfo.symbol
        );
        
        if (newPrice && newPrice !== this.currentPrice) {
          const change = ((newPrice - this.currentPrice) / this.currentPrice * 100).toFixed(2);
          console.log(`📊 Price update: $${this.currentPrice.toFixed(6)} → $${newPrice.toFixed(6)} (${change > 0 ? '+' : ''}${change}%)`);
          this.currentPrice = newPrice;
        }
      } catch (error) {
        console.error('Error updating price:', error.message);
      }
    }, this.options.priceUpdateInterval);
  }

  startPeriodicReports() {
    setInterval(async () => {
      await this.generateReport();
    }, this.options.updateInterval);
  }

  async generateReport() {
    const profitableWallets = this.calculateProfitability();
    this.stats.profitableWallets = profitableWallets.length;

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Monitor Status Report - ${new Date().toLocaleTimeString()}`);
    console.log('='.repeat(60));
    console.log(`Token: ${this.tokenInfo.name} (${this.tokenInfo.symbol})`);
    console.log(`Current Price: $${this.currentPrice?.toFixed(6) || 'N/A'}`);
    console.log(`Total Wallets Tracked: ${this.wallets.size}`);
    console.log(`Profitable Wallets: ${profitableWallets.length}`);
    console.log(`Total Transfers: ${this.stats.totalTransfers}`);
    console.log(`New Wallets: ${this.stats.newWallets}`);
    console.log(`Uptime: ${Math.floor((Date.now() - this.stats.startTime) / 1000)}s`);
    
    if (profitableWallets.length > 0) {
      console.log(`\n🏆 Top 5 Profitable Wallets:`);
      profitableWallets.slice(0, 5).forEach((w, i) => {
        console.log(
          `   ${i + 1}. ${w.address.slice(0, 10)}...${w.address.slice(-8)} | ` +
          `Profit: $${w.profitUSD.toFixed(2)} | Holdings: $${w.currentValueUSD.toFixed(2)}`
        );
      });
    }
    console.log('='.repeat(60) + '\n');
  }

  calculateProfitability() {
    const profitableWallets = [];

    for (const wallet of this.wallets.values()) {
      if (wallet.buys.length === 0 && wallet.sells.length === 0) continue;

      const balanceNum = Number(ethers.formatUnits(wallet.currentBalance, this.tokenInfo.decimals));
      const currentValueUSD = balanceNum * (this.currentPrice || 0);
      const costBasisUSD = wallet.totalSpentUSD - wallet.totalReceivedUSD;
      const profitUSD = wallet.totalReceivedUSD - wallet.totalSpentUSD + currentValueUSD;

      if (profitUSD >= this.options.minProfitUSD) {
        profitableWallets.push({
          address: wallet.address,
          profitUSD,
          currentValueUSD,
          costBasisUSD,
          buyCount: wallet.buys.length,
          sellCount: wallet.sells.length,
          firstSeen: wallet.firstSeen,
          lastSeen: wallet.lastSeen
        });
      }
    }

    return profitableWallets.sort((a, b) => b.profitUSD - a.profitUSD);
  }

  log(message) {
    if (this.options.logFile) {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(this.options.logFile, `[${timestamp}] ${message}\n`);
    }
  }

  async stop() {
    console.log('\n\n🛑 Stopping monitor...');
    this.isRunning = false;
    
    // Remove event listeners
    this.tokenContract.removeAllListeners();
    
    // Generate final report
    await this.generateReport();
    
    console.log('✅ Monitor stopped');
    process.exit(0);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node monitor-token.js <TOKEN_ADDRESS> [RPC_URL] [OPTIONS]');
    console.log('\nOptions:');
    console.log('  --update-interval <ms>     Report update interval (default: 30000)');
    console.log('  --price-interval <ms>      Price update interval (default: 60000)');
    console.log('  --min-profit <usd>          Minimum profit to show (default: 0)');
    console.log('  --alert-threshold <usd>    Alert threshold (default: 1000)');
    console.log('  --log-file <path>          Log file path (optional)');
    console.log('\nExample:');
    console.log('  node monitor-token.js 0x1234...5678 https://rpc.monad.xyz');
    console.log('  node monitor-token.js 0x1234...5678 --min-profit 100 --alert-threshold 5000');
    process.exit(1);
  }
  
  const tokenAddress = args[0];
  const rpcUrl = args[1]?.startsWith('http') ? args[1] : (process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz');
  
  // Parse options
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--update-interval') options.updateInterval = parseInt(args[++i]);
    if (args[i] === '--price-interval') options.priceUpdateInterval = parseInt(args[++i]);
    if (args[i] === '--min-profit') options.minProfitUSD = parseFloat(args[++i]);
    if (args[i] === '--alert-threshold') options.alertThreshold = parseFloat(args[++i]);
    if (args[i] === '--log-file') options.logFile = args[++i];
  }
  
  try {
    const monitor = new TokenMonitor(rpcUrl, tokenAddress, options);
    await monitor.start();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

