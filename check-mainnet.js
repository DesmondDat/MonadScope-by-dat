import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Monad mainnet RPC endpoints (update when official endpoints are available)
const MONAD_RPC_ENDPOINTS = [
  process.env.MONAD_RPC_URL || 'https://sepolia.monad.xyz', // Placeholder - update with actual mainnet RPC
  'https://rpc.monad.xyz', // Placeholder
];

async function checkMainnetStatus() {
  console.log('🔍 Checking Monad Mainnet Status...\n');
  
  for (const rpcUrl of MONAD_RPC_ENDPOINTS) {
    try {
      console.log(`Testing RPC: ${rpcUrl}`);
      
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Check if we can connect
      const blockNumber = await provider.getBlockNumber();
      const network = await provider.getNetwork();
      const block = await provider.getBlock(blockNumber);
      
      console.log('✅ Connection successful!');
      console.log(`   Chain ID: ${network.chainId}`);
      console.log(`   Current Block: ${blockNumber}`);
      console.log(`   Block Timestamp: ${new Date(block.timestamp * 1000).toLocaleString()}`);
      console.log(`   Network Name: ${network.name}`);
      
      // Check if it's mainnet (chain ID 1 for Ethereum, Monad might have different ID)
      if (network.chainId === 1n) {
        console.log('⚠️  Warning: Chain ID 1 is Ethereum, not Monad mainnet');
      }
      
      return {
        isLive: true,
        rpcUrl,
        chainId: network.chainId.toString(),
        blockNumber,
        timestamp: block.timestamp
      };
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message}\n`);
      continue;
    }
  }
  
  console.log('\n❌ Could not connect to Monad mainnet');
  console.log('💡 Mainnet may not be live yet, or RPC endpoints need to be updated');
  
  return {
    isLive: false,
    rpcUrl: null,
    chainId: null,
    blockNumber: null,
    timestamp: null
  };
}

// Run the check
checkMainnetStatus()
  .then(result => {
    if (result.isLive) {
      console.log('\n✅ Monad Mainnet is LIVE!');
      process.exit(0);
    } else {
      console.log('\n⏳ Monad Mainnet is not live yet');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

