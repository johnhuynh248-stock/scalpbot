require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Initialize clients
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Active trades storage
const activeTrades = new Map();

// Tradier API configuration
const TRADIER_API_URL = 'https://api.tradier.com/v1';
const TRADIER_SANDBOX_URL = 'https://sandbox.tradier.com/v1';
const USE_SANDBOX = process.env.TRADIER_SANDBOX === 'true';
const BASE_URL = USE_SANDBOX ? TRADIER_SANDBOX_URL : TRADIER_API_URL;

// Helper: Get Tradier headers
function getTradierHeaders() {
    return {
        'Authorization': `Bearer ${process.env.TRADIER_API_KEY}`,
        'Accept': 'application/json'
    };
}

// Helper: Get market data from Tradier
async function getMarketData(symbol) {
    try {
        const session = getMarketSession();
        const isMarketOpen = session === 'regular' || session === 'pre-market' || session === 'after-hours';
        
        // Get quote
        const quoteResponse = await axios.get(
            `${BASE_URL}/markets/quotes`,
            {
                params: { symbols: symbol },
                headers: getTradierHeaders()
            }
        );

        const quote = quoteResponse.data.quotes.quote;
        if (!quote) {
            throw new Error('Invalid symbol or no data available');
        }

        // Get historical data for indicators (1 day, 5min intervals)
        const historyResponse = await axios.get(
            `${BASE_URL}/markets/history`,
            {
                params: {
                    symbol: symbol,
                    interval: '5min',
                    start: getDateNDaysAgo(5),
                    end: getTodayDate()
                },
                headers: getTradierHeaders()
            }
        );

        const history = historyResponse.data.history?.day || [];

        // Calculate indicators
        const indicators = calculateIndicators(history, quote);

        return {
            symbol: symbol,
            price: quote.last || quote.prevclose,
            bid: quote.bid,
            ask: quote.ask,
            volume: quote.volume,
            change: quote.change,
            changePercent: quote.change_percentage,
            high: quote.high,
            low: quote.low,
            open: quote.open,
            prevClose: quote.prevclose,
            indicators: indicators,
            timestamp: new Date().toISOString(),
            isMarketOpen: isMarketOpen,
            marketSession: session,
            dataAge: isMarketOpen ? 'real-time' : 'last-close'
        };
    } catch (error) {
        console.error('Tradier API error:', error.message);
        throw new Error(`Failed to fetch market data: ${error.message}`);
    }
}

// Helper: Calculate technical indicators
function calculateIndicators(history, currentQuote) {
    if (!history || history.length === 0) {
        return {
            vwap: currentQuote.last,
            rsi: 50,
            macd: { value: 0, signal: 0, histogram: 0 },
            supportLevels: [],
            resistanceLevels: []
        };
    }

    const closes = history.map(d => d.close);
    const highs = history.map(d => d.high);
    const lows = history.map(d => d.low);
    const volumes = history.map(d => d.volume);

    // Calculate VWAP
    let vwapSum = 0;
    let volumeSum = 0;
    for (let i = 0; i < history.length; i++) {
        const typicalPrice = (history[i].high + history[i].low + history[i].close) / 3;
        vwapSum += typicalPrice * history[i].volume;
        volumeSum += history[i].volume;
    }
    const vwap = volumeSum > 0 ? vwapSum / volumeSum : currentQuote.last;

    // Calculate RSI (14 period)
    const rsi = calculateRSI(closes, 14);

    // Calculate MACD
    const macd = calculateMACD(closes);

    // Find support/resistance levels
    const supportLevels = findSupportLevels(lows, currentQuote.last);
    const resistanceLevels = findResistanceLevels(highs, currentQuote.last);

    return {
        vwap: vwap,
        rsi: rsi,
        macd: macd,
        supportLevels: supportLevels,
        resistanceLevels: resistanceLevels
    };
}

// Helper: Calculate RSI
function calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
}

// Helper: Calculate MACD
function calculateMACD(closes) {
    if (closes.length < 26) {
        return { value: 0, signal: 0, histogram: 0 };
    }

    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;

    // For signal line, we'd need to calculate EMA of MACD line
    // Simplified: use a basic approximation
    const signalLine = macdLine * 0.9;
    const histogram = macdLine - signalLine;

    return {
        value: macdLine,
        signal: signalLine,
        histogram: histogram
    };
}

// Helper: Calculate EMA
function calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < data.length; i++) {
        ema = (data[i] - ema) * multiplier + ema;
    }

    return ema;
}

// Helper: Find support levels
function findSupportLevels(lows, currentPrice) {
    const recentLows = lows.slice(-50);
    const levels = [];
    
    for (let i = 1; i < recentLows.length - 1; i++) {
        if (recentLows[i] < recentLows[i - 1] && recentLows[i] < recentLows[i + 1]) {
            if (recentLows[i] < currentPrice) {
                levels.push(recentLows[i]);
            }
        }
    }

    // Return top 3 nearest support levels
    return levels
        .sort((a, b) => b - a)
        .slice(0, 3)
        .map(l => parseFloat(l.toFixed(2)));
}

// Helper: Find resistance levels
function findResistanceLevels(highs, currentPrice) {
    const recentHighs = highs.slice(-50);
    const levels = [];
    
    for (let i = 1; i < recentHighs.length - 1; i++) {
        if (recentHighs[i] > recentHighs[i - 1] && recentHighs[i] > recentHighs[i + 1]) {
            if (recentHighs[i] > currentPrice) {
                levels.push(recentHighs[i]);
            }
        }
    }

    // Return top 3 nearest resistance levels
    return levels
        .sort((a, b) => a - b)
        .slice(0, 3)
        .map(l => parseFloat(l.toFixed(2)));
}

// Helper: Get date N days ago
function getDateNDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
}

// Helper: Get today's date
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// Helper: Get current market session
function getMarketSession() {
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const currentTime = hours + minutes / 60;

    // US Market hours (EST = UTC-5, EDT = UTC-4)
    // Pre-market: 4:00-9:30 EST (9:00-14:30 UTC)
    // Regular: 9:30-16:00 EST (14:30-21:00 UTC)
    // After-hours: 16:00-20:00 EST (21:00-01:00 UTC)

    if (currentTime >= 9 && currentTime < 14.5) {
        return 'pre-market';
    } else if (currentTime >= 14.5 && currentTime < 21) {
        return 'regular';
    } else if (currentTime >= 21 || currentTime < 1) {
        return 'after-hours';
    } else {
        return 'closed';
    }
}

// Helper: Analyze with OpenAI Vision
async function analyzeWithVision(imageUrls, marketData, analysisType = 'signal') {
    try {
        const messages = [
            {
                role: 'system',
                content: `Bạn là chuyên gia phân tích scalping chuyên nghiệp. Phân tích bằng tiếng Việt với các thuật ngữ trading bằng tiếng Anh.

CHIẾN LƯỢC SCALPING (1-3 DTE OPTIONS):
- TP1: +0.5-0.8% (10-20 phút)
- TP2: +1.0-1.5% (15-30 phút)  
- SL: -0.7-0.8%
- Time stop: 30 phút
- Delta: 0.45-0.65
- ATM hoặc 1 strike OTM

QUY TẮC ENTRY:
✅ Price trên/dưới VWAP (bias rõ ràng)
✅ HTF structure aligned
✅ LTF confirmation signal
✅ Không có structure conflicts
✅ Confidence score >70%

PHÂN TÍCH:
1. HTF Context (5m/15m)
2. LTF Signal (1m/2m)
3. Key Levels
4. Indicators (RSI, MACD, VWAP)
5. Confidence Score
6. Options Setup (strike, DTE, delta)

LƯU Ý:
- Nếu confidence <70%: SKIP
- Có conflicts: WAIT
- Đã qua 30 min: EXIT
- Stop hit: CẮT NGAY`
            }
        ];

        // Build user message with images
        const content = [];
        
        // Add images
        for (const url of imageUrls) {
            content.push({
                type: 'image_url',
                image_url: { url: url }
            });
        }

        // Add market data context
        if (marketData) {
            const marketWarning = !marketData.isMarketOpen ? 
                '\n⚠️ MARKET CLOSED - Analysis based on last close data. DO NOT TRADE NOW!' : '';
            
            const context = `
MARKET DATA - ${marketData.symbol}:
Session: ${marketData.marketSession.toUpperCase()} ${marketData.isMarketOpen ? '✅' : '❌ CLOSED'}
Data: ${marketData.dataAge}${marketWarning}

Price: $${marketData.price}
Change: ${marketData.changePercent}%
VWAP: $${marketData.indicators.vwap}
RSI: ${marketData.indicators.rsi.toFixed(2)}
MACD: ${marketData.indicators.macd.histogram.toFixed(4)}
Support: ${marketData.indicators.supportLevels.join(', ')}
Resistance: ${marketData.indicators.resistanceLevels.join(', ')}

Phân tích ${analysisType === 'full' ? 'FULL VISUAL' : 'SIGNAL'} và đưa ra:
1. Direction: CALL/PUT
2. Lý do (Vietnamese với English terms)
3. Entry price
4. TP1/TP2/SL levels
5. Options setup (strike, DTE, delta)
6. Confidence score (%)
7. Time target
${!marketData.isMarketOpen ? '8. ⚠️ MARKET CLOSED WARNING' : ''}`;
            
            content.push({
                type: 'text',
                text: context
            });
        } else {
            content.push({
                type: 'text',
                text: `Phân tích chart và đưa ra setup scalping chi tiết với confidence score.`
            });
        }

        messages.push({
            role: 'user',
            content: content
        });

        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Using gpt-4o with vision
            messages: messages,
            max_tokens: 1000,
            temperature: 0.3
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI Vision error:', error.message);
        throw new Error(`Analysis failed: ${error.message}`);
    }
}

// Helper: Analyze with text only
async function analyzeText(symbol, direction = null) {
    try {
        const marketData = await getMarketData(symbol);
        
        const prompt = `Phân tích SCALPING cho ${symbol}${direction ? ' - ' + direction : ''}:

MARKET DATA:
Price: $${marketData.price}
Change: ${marketData.changePercent}%
VWAP: $${marketData.indicators.vwap.toFixed(2)}
RSI: ${marketData.indicators.rsi.toFixed(2)}
MACD Histogram: ${marketData.indicators.macd.histogram.toFixed(4)}
Support: ${marketData.indicators.supportLevels.join(', ')}
Resistance: ${marketData.indicators.resistanceLevels.join(', ')}
Volume: ${marketData.volume}
Session: ${getMarketSession()}

Đưa ra:
1. Direction: CALL/PUT
2. Lý do (Vietnamese với English terms)
3. Entry: $${marketData.price}
4. TP1 (+0.5-0.8%): $X
5. TP2 (+1.0-1.5%): $X
6. SL (-0.7-0.8%): $X
7. Options: Strike/DTE/Delta
8. Confidence: X%
9. Time target: X phút`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `Bạn là chuyên gia scalping. Phân tích ngắn gọn bằng tiếng Việt với thuật ngữ tiếng Anh. Chỉ trade khi confidence >70%.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 800,
            temperature: 0.3
        });

        return {
            analysis: response.choices[0].message.content,
            marketData: marketData
        };
    } catch (error) {
        console.error('Text analysis error:', error.message);
        throw error;
    }
}

// Command: /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcome = `🤖 *Professional Scalping Bot*

Chào mừng! Bot hỗ trợ 3 phương thức phân tích:

⚡ *TEXT COMMANDS* (10-15s)
\`/analyze SPY\`
\`/scalp TSLA CALL\`
\`/check AAPL\`

⭐ *SIGNAL SCREENSHOT* (15-25s)
Gửi 1 ảnh signal → Phân tích nhanh

📊 *FULL VISUAL* (20-35s)
Gửi 3 ảnh (HTF/LTF/Indicators) → Phân tích chi tiết

📈 *TRADE TRACKING*
\`/enter SPY CALL 585.50\`
\`/check\` - Monitor trades
\`/trades\` - List positions
\`/close SPY\` - Remove trade

ℹ️ *INFO*
\`/help\` - Full guide
\`/session\` - Market session

🎯 SCALPING STRATEGY:
• 1-3 DTE options only
• TP1: +0.5-0.8% (10-20 min)
• TP2: +1.0-1.5% (15-30 min)
• SL: -0.7-0.8%
• Time stop: 30 min

Ready to scalp! 🚀`;

    bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
});

// Command: /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const help = `📚 *HƯỚNG DẪN CHI TIẾT*

*1️⃣ TEXT ANALYSIS (Fastest)*
\`/analyze SYMBOL\` - Quick analysis
\`/scalp SYMBOL CALL\` - With direction
\`/check SYMBOL\` - Alternative

*2️⃣ SIGNAL SCREENSHOT (Recommended)*
• Send 1 trading signal image
• Get analysis in 15-25 seconds

*3️⃣ FULL VISUAL (Most Detailed)*
• Send 3 images together:
  - HTF view (5m/15m)
  - LTF view (1m/2m)
  - Indicators
• Get comprehensive analysis

*📈 TRADE TRACKING*
\`/enter SPY CALL 585.50\`
• Auto-calculates TP1/TP2/SL
• Live P/L monitoring

\`/check\` or \`/status\`
• See all active trades
• Real-time updates

\`/trades\`
• List all positions

\`/close SYMBOL\`
• Remove tracked trade

*🎯 SCALPING RULES*
✅ Confidence >70%
✅ 1-3 DTE options
✅ Delta 0.45-0.65
✅ ATM or 1 strike OTM
✅ Exit after 30 min max

*⚠️ RISK MANAGEMENT*
• Max 2% per trade
• 3 losses = stop trading
• Target 65%+ win rate
• Min 1.5:1 R:R ratio

Chúc bạn trade thành công! 📊`;

    bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
});

// Command: /session
bot.onText(/\/session/, (msg) => {
    const chatId = msg.chat.id;
    const session = getMarketSession();
    const sessionEmoji = {
        'pre-market': '🌅',
        'regular': '📈',
        'after-hours': '🌆',
        'closed': '🌙'
    };
    
    const now = new Date();
    const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    let nextOpen = '';
    if (session === 'closed') {
        nextOpen = '\n\n📅 Next session:\n• Pre-market: 4:00 AM EST\n• Regular: 9:30 AM EST';
    }

    const message = `${sessionEmoji[session]} *Current Session: ${session.toUpperCase()}*

${session === 'regular' ? '✅ Best time for scalping!\n📊 Real-time data available' : 
  session === 'pre-market' ? '⚠️ Lower liquidity, wider spreads\n📊 Real-time data available' :
  session === 'after-hours' ? '⚠️ Limited activity\n📊 Real-time data available' :
  '❌ Market closed\n🕐 Using last close data\n⛔ DO NOT TRADE NOW'}

🕐 EST Time: ${estTime.toLocaleTimeString('en-US')}${nextOpen}

💡 Bot works 24/7 but trading only during market hours!`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Command: /analyze or /scalp or /check (text analysis)
bot.onText(/\/(analyze|scalp|check)\s+([A-Z]+)(\s+(CALL|PUT))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = match[2].toUpperCase();
    const direction = match[4] ? match[4].toUpperCase() : null;

    const processingMsg = await bot.sendMessage(
        chatId,
        `⚡ Analyzing ${symbol}${direction ? ' ' + direction : ''}...\n⏱️ 10-15 seconds...`
    );

    try {
        const result = await analyzeText(symbol, direction);
        
        const marketWarning = !result.marketData.isMarketOpen ? 
            `\n⚠️ *Market ${result.marketData.marketSession.toUpperCase()}*\nUsing last close data - Not tradeable now!\n` : '';
        
        const response = `📊 *${symbol} SCALPING ANALYSIS*
${marketWarning}        
${result.analysis}

💰 *Market Data:*
Price: $${result.marketData.price} ${result.marketData.dataAge === 'last-close' ? '(Last Close)' : '(Live)'}
Change: ${result.marketData.changePercent}%
VWAP: $${result.marketData.indicators.vwap.toFixed(2)}
Session: ${result.marketData.marketSession}

⏰ Analyzed at: ${new Date().toLocaleTimeString('en-US')}`;

        await bot.deleteMessage(chatId, processingMsg.message_id);
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (error) {
        await bot.deleteMessage(chatId, processingMsg.message_id);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// Handle photo messages (1 or 3 images)
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    
    // Check if multiple images in media group
    const mediaGroupId = msg.media_group_id;
    
    if (mediaGroupId) {
        // Handle multiple images - wait for all to arrive
        if (!bot.mediaGroups) bot.mediaGroups = new Map();
        
        if (!bot.mediaGroups.has(mediaGroupId)) {
            bot.mediaGroups.set(mediaGroupId, []);
            
            // Set timeout to process after 2 seconds
            setTimeout(async () => {
                const images = bot.mediaGroups.get(mediaGroupId);
                bot.mediaGroups.delete(mediaGroupId);
                
                if (images && images.length > 0) {
                    await processImages(chatId, images, images.length >= 3 ? 'full' : 'signal');
                }
            }, 2000);
        }
        
        bot.mediaGroups.get(mediaGroupId).push(msg.photo[msg.photo.length - 1].file_id);
    } else {
        // Single image
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        await processImages(chatId, [fileId], 'signal');
    }
});

// Helper: Process images
async function processImages(chatId, fileIds, analysisType) {
    const timeEstimate = analysisType === 'full' ? '20-35' : '15-25';
    const processingMsg = await bot.sendMessage(
        chatId,
        `${analysisType === 'full' ? '📊' : '⭐'} Processing ${fileIds.length} image(s)...\n⏱️ ${timeEstimate} seconds...`
    );

    try {
        // Download images and convert to URLs
        const imageUrls = [];
        
        for (const fileId of fileIds) {
            const file = await bot.getFile(fileId);
            const imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
            imageUrls.push(imageUrl);
        }

        // Try to extract symbol from caption or ask
        const symbol = msg.caption ? extractSymbol(msg.caption) : null;
        const marketData = symbol ? await getMarketData(symbol) : null;

        // Analyze with vision
        const analysis = await analyzeWithVision(imageUrls, marketData, analysisType);
        
        const response = `${analysisType === 'full' ? '📊 FULL' : '⭐ SIGNAL'} *VISUAL ANALYSIS*

${analysis}

⏰ Analyzed at: ${new Date().toLocaleTimeString('en-US')}`;

        await bot.deleteMessage(chatId, processingMsg.message_id);
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (error) {
        await bot.deleteMessage(chatId, processingMsg.message_id);
        bot.sendMessage(chatId, `❌ Error: ${error.message}\n\nTry adding symbol in caption: SPY, TSLA, etc.`);
    }
}

// Helper: Extract symbol from text
function extractSymbol(text) {
    const match = text.match(/\b[A-Z]{1,5}\b/);
    return match ? match[0] : null;
}

// Command: /enter (add trade)
bot.onText(/\/enter\s+([A-Z]+)\s+(CALL|PUT)\s+([\d.]+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = match[1].toUpperCase();
    const direction = match[2].toUpperCase();
    const entryPrice = parseFloat(match[3]);

    try {
        const marketData = await getMarketData(symbol);
        
        // Calculate TP/SL levels
        const tp1 = direction === 'CALL' ? 
            entryPrice * 1.006 : entryPrice * 0.994; // +0.6% or -0.6%
        const tp2 = direction === 'CALL' ?
            entryPrice * 1.012 : entryPrice * 0.988; // +1.2% or -1.2%
        const sl = direction === 'CALL' ?
            entryPrice * 0.9925 : entryPrice * 1.0075; // -0.75% or +0.75%

        const trade = {
            symbol,
            direction,
            entryPrice,
            entryTime: new Date(),
            tp1: parseFloat(tp1.toFixed(2)),
            tp2: parseFloat(tp2.toFixed(2)),
            sl: parseFloat(sl.toFixed(2)),
            currentPrice: marketData.price,
            tp1Hit: false,
            tp2Hit: false,
            slHit: false
        };

        activeTrades.set(symbol, trade);

        const response = `✅ *Trade Added: ${symbol} ${direction}*

📍 Entry: $${entryPrice}
🎯 TP1: $${tp1.toFixed(2)} (+0.6%)
🎯 TP2: $${tp2.toFixed(2)} (+1.2%)
🛑 SL: $${sl.toFixed(2)} (-0.75%)

💰 Current: $${marketData.price}
⏰ Time: ${new Date().toLocaleTimeString('en-US')}
⏱️ Max hold: 30 minutes

Use \`/check\` to monitor!`;

        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

        // Start monitoring
        startTradeMonitoring(chatId, symbol);
    } catch (error) {
        bot.sendMessage(chatId, `❌ Error adding trade: ${error.message}`);
    }
});

// Command: /check or /status (check all trades)
bot.onText(/\/(check|status)$/i, async (msg) => {
    const chatId = msg.chat.id;

    if (activeTrades.size === 0) {
        bot.sendMessage(chatId, '📭 No active trades.\n\nUse `/enter SYMBOL CALL/PUT PRICE` to add.', 
            { parse_mode: 'Markdown' });
        return;
    }

    let response = '📊 *ACTIVE TRADES*\n\n';

    for (const [symbol, trade] of activeTrades) {
        try {
            const marketData = await getMarketData(symbol);
            const currentPrice = marketData.price;
            const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2);
            const emoji = parseFloat(pnlPercent) >= 0 ? '📈' : '📉';

            const timeElapsed = Math.floor((new Date() - trade.entryTime) / 1000 / 60);
            const timeLeft = Math.max(0, 30 - timeElapsed);

            response += `${emoji} *${symbol} ${trade.direction}*
Entry: $${trade.entryPrice}
Current: $${currentPrice}
P/L: ${pnlPercent}%

TP1: $${trade.tp1} ${trade.tp1Hit ? '✅' : '⏳'}
TP2: $${trade.tp2} ${trade.tp2Hit ? '✅' : '⏳'}
SL: $${trade.sl} ${trade.slHit ? '❌' : '🛡️'}

⏱️ Time: ${timeElapsed}m / ${timeLeft}m left
─────────────\n`;
        } catch (error) {
            response += `❌ ${symbol}: Error fetching data\n─────────────\n`;
        }
    }

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
});

// Command: /trades (list all)
bot.onText(/\/trades/, (msg) => {
    const chatId = msg.chat.id;

    if (activeTrades.size === 0) {
        bot.sendMessage(chatId, '📭 No active trades.');
        return;
    }

    let response = '📋 *ACTIVE POSITIONS*\n\n';
    
    for (const [symbol, trade] of activeTrades) {
        response += `• ${symbol} ${trade.direction} @ $${trade.entryPrice}\n`;
    }

    response += `\nTotal: ${activeTrades.size} position(s)`;
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
});

// Command: /close (remove trade)
bot.onText(/\/close\s+([A-Z]+)/i, (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = match[1].toUpperCase();

    if (activeTrades.has(symbol)) {
        activeTrades.delete(symbol);
        bot.sendMessage(chatId, `✅ ${symbol} trade removed.`);
    } else {
        bot.sendMessage(chatId, `❌ No active trade for ${symbol}.`);
    }
});

// Helper: Monitor trade
function startTradeMonitoring(chatId, symbol) {
    const checkInterval = setInterval(async () => {
        const trade = activeTrades.get(symbol);
        if (!trade) {
            clearInterval(checkInterval);
            return;
        }

        try {
            const marketData = await getMarketData(symbol);
            const currentPrice = marketData.price;
            
            // Check TP1
            if (!trade.tp1Hit) {
                if ((trade.direction === 'CALL' && currentPrice >= trade.tp1) ||
                    (trade.direction === 'PUT' && currentPrice <= trade.tp1)) {
                    trade.tp1Hit = true;
                    bot.sendMessage(chatId, 
                        `🎯 *TP1 HIT!* ${symbol} ${trade.direction}\n` +
                        `Price: $${currentPrice}\n` +
                        `Take 60-80% profit now! 💰`,
                        { parse_mode: 'Markdown' }
                    );
                }
            }

            // Check TP2
            if (!trade.tp2Hit) {
                if ((trade.direction === 'CALL' && currentPrice >= trade.tp2) ||
                    (trade.direction === 'PUT' && currentPrice <= trade.tp2)) {
                    trade.tp2Hit = true;
                    bot.sendMessage(chatId,
                        `🎯🎯 *TP2 HIT!* ${symbol} ${trade.direction}\n` +
                        `Price: $${currentPrice}\n` +
                        `Exit remaining position! 🎉`,
                        { parse_mode: 'Markdown' }
                    );
                }
            }

            // Check SL
            if (!trade.slHit) {
                if ((trade.direction === 'CALL' && currentPrice <= trade.sl) ||
                    (trade.direction === 'PUT' && currentPrice >= trade.sl)) {
                    trade.slHit = true;
                    bot.sendMessage(chatId,
                        `🛑 *STOP LOSS HIT!* ${symbol} ${trade.direction}\n` +
                        `Price: $${currentPrice}\n` +
                        `Cut loss now! ❌`,
                        { parse_mode: 'Markdown' }
                    );
                    clearInterval(checkInterval);
                }
            }

            // Check time stop (30 minutes)
            const timeElapsed = (new Date() - trade.entryTime) / 1000 / 60;
            if (timeElapsed >= 30) {
                bot.sendMessage(chatId,
                    `⏰ *TIME STOP!* ${symbol} ${trade.direction}\n` +
                    `30 minutes reached.\n` +
                    `Exit position regardless of P/L! 🏁`,
                    { parse_mode: 'Markdown' }
                );
                clearInterval(checkInterval);
            }

            trade.currentPrice = currentPrice;
        } catch (error) {
            console.error(`Error monitoring ${symbol}:`, error.message);
        }
    }, 15000); // Check every 15 seconds
}

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

// Startup
console.log('🤖 Professional Scalping Bot started!');
console.log('📊 Using Tradier API');
console.log('👁️ Using OpenAI Vision (gpt-4o)');
console.log('🌍 Bot available 24/7 - Monitors market hours automatically');
console.log('✅ Ready to scalp!');
console.log(`Current session: ${getMarketSession().toUpperCase()}`);
