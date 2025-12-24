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
// Handle both string "true" and boolean true
const USE_SANDBOX = process.env.TRADIER_SANDBOX === 'true' || process.env.TRADIER_SANDBOX === true;
const BASE_URL = USE_SANDBOX ? TRADIER_SANDBOX_URL : TRADIER_API_URL;

// Trading timeframes configuration
const TIMEFRAMES = {
    scalping: {
        intervals: ['1min', '3min', '5min'],
        htf: '5min',    // Higher timeframe
        ltf: '1min',    // Lower timeframe
        lookback: 1,    // 1 day
        tp1: 0.003,     // 0.3% TP1
        tp2: 0.006,     // 0.6% TP2
        sl: 0.005,      // 0.5% SL
        rr_min: 1.5,    // Minimum R:R ratio
        hold_time: '5-15 min'
    },
    daytrading: {
        intervals: ['5min', '15min', '1h'],
        htf: '15min',
        ltf: '5min',
        lookback: 2,    // 2 days
        tp1: 0.008,     // 0.8% TP1
        tp2: 0.015,     // 1.5% TP2
        sl: 0.008,      // 0.8% SL
        rr_min: 1.5,
        hold_time: '30-90 min'
    },
    swing: {
        intervals: ['1h', '4h', 'daily'],
        htf: '4h',
        ltf: '1h',
        lookback: 10,   // 10 days
        tp1: 0.025,     // 2.5% TP1
        tp2: 0.05,      // 5.0% TP2
        sl: 0.02,       // 2.0% SL
        rr_min: 2.0,
        hold_time: '1-5 days'
    }
};

// Helper: Get Tradier headers
function getTradierHeaders() {
    const apiKey = process.env.TRADIER_API_KEY;
    
    // Log for debugging (remove after fixing)
    console.log('Tradier API Key exists:', !!apiKey);
    console.log('Tradier API Key length:', apiKey?.length);
    console.log('Using sandbox:', USE_SANDBOX);
    console.log('Base URL:', BASE_URL);
    
    return {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
    };
}

// Helper: Get market data from Tradier with multiple timeframes
async function getMarketDataMultiTF(symbol, tradingStyle = 'scalping') {
    try {
        const session = getMarketSession();
        const isMarketOpen = session === 'regular' || session === 'pre-market' || session === 'after-hours';
        
        const config = TIMEFRAMES[tradingStyle];
        
        console.log(`Fetching ${tradingStyle} data for ${symbol} from Tradier...`);
        
        // Get quote (always needed)
        const quoteResponse = await axios.get(
            `${BASE_URL}/markets/quotes`,
            {
                params: { symbols: symbol },
                headers: getTradierHeaders()
            }
        );

        console.log('Quote response received:', quoteResponse.status);

        const quote = quoteResponse.data.quotes.quote;
        if (!quote) {
            throw new Error('Invalid symbol or no data available');
        }

        // Get data for HTF (Higher Timeframe) and LTF (Lower Timeframe)
        const htfInterval = USE_SANDBOX ? 'daily' : config.htf;
        const ltfInterval = USE_SANDBOX ? 'daily' : config.ltf;
        
        let htfData = [];
        let ltfData = [];
        
        // Fetch HTF data
        try {
            const htfResponse = await axios.get(
                `${BASE_URL}/markets/history`,
                {
                    params: {
                        symbol: symbol,
                        interval: htfInterval,
                        start: getDateNDaysAgo(config.lookback * 2),
                        end: getTodayDate()
                    },
                    headers: getTradierHeaders(),
                    timeout: 10000
                }
            );
            htfData = htfResponse.data.history?.day || [];
            console.log(`HTF data (${htfInterval}): ${htfData.length} bars`);
        } catch (error) {
            console.warn(`HTF data error:`, error.message);
        }

        // Fetch LTF data (only in production)
        if (!USE_SANDBOX) {
            try {
                const ltfResponse = await axios.get(
                    `${BASE_URL}/markets/history`,
                    {
                        params: {
                            symbol: symbol,
                            interval: ltfInterval,
                            start: getDateNDaysAgo(config.lookback),
                            end: getTodayDate()
                        },
                        headers: getTradierHeaders(),
                        timeout: 10000
                    }
                );
                ltfData = ltfResponse.data.history?.day || [];
                console.log(`LTF data (${ltfInterval}): ${ltfData.length} bars`);
            } catch (error) {
                console.warn(`LTF data error:`, error.message);
            }
        }

        // Calculate indicators for both timeframes
        const htfIndicators = calculateIndicators(htfData, quote);
        const ltfIndicators = htfData.length > 0 ? calculateIndicators(ltfData, quote) : htfIndicators;

        // Calculate R:R adjusted TP/SL
        const targets = calculateTargets(quote.last, config, htfIndicators.atr);

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
            htf: {
                interval: htfInterval,
                indicators: htfIndicators
            },
            ltf: {
                interval: ltfInterval,
                indicators: ltfIndicators
            },
            targets: targets,
            tradingStyle: tradingStyle,
            timestamp: new Date().toISOString(),
            isMarketOpen: isMarketOpen,
            marketSession: session,
            dataAge: isMarketOpen ? 'real-time' : 'last-close',
            dataInterval: htfInterval
        };
    } catch (error) {
        console.error('Tradier API error details:');
        console.error('- Message:', error.message);
        console.error('- Status:', error.response?.status);
        console.error('- Response Data:', JSON.stringify(error.response?.data, null, 2));
        
        throw new Error(`Failed to fetch market data: ${error.response?.data || error.message}`);
    }
}

// Helper: Calculate targets with R:R ratio
function calculateTargets(entryPrice, config, atr) {
    // Base calculations
    const baseTP1 = entryPrice * (1 + config.tp1);
    const baseTP2 = entryPrice * (1 + config.tp2);
    const baseSL = entryPrice * (1 - config.sl);
    
    // ATR-adjusted (if ATR is significant)
    const atrMultiplier = atr > 0 ? Math.min(atr / entryPrice, 0.02) : 0;
    
    // Adjusted for volatility
    const tp1 = baseTP1 + (entryPrice * atrMultiplier * 0.5);
    const tp2 = baseTP2 + (entryPrice * atrMultiplier);
    const sl = baseSL - (entryPrice * atrMultiplier * 0.3);
    
    // Calculate R:R ratios
    const risk = entryPrice - sl;
    const reward1 = tp1 - entryPrice;
    const reward2 = tp2 - entryPrice;
    
    const rr1 = risk > 0 ? reward1 / risk : 0;
    const rr2 = risk > 0 ? reward2 / risk : 0;
    
    return {
        entry: entryPrice,
        tp1: parseFloat(tp1.toFixed(2)),
        tp2: parseFloat(tp2.toFixed(2)),
        sl: parseFloat(sl.toFixed(2)),
        tp1_percent: ((tp1 - entryPrice) / entryPrice * 100).toFixed(2),
        tp2_percent: ((tp2 - entryPrice) / entryPrice * 100).toFixed(2),
        sl_percent: ((sl - entryPrice) / entryPrice * 100).toFixed(2),
        rr1: rr1.toFixed(2),
        rr2: rr2.toFixed(2),
        risk_amount: risk.toFixed(2),
        reward1_amount: reward1.toFixed(2),
        reward2_amount: reward2.toFixed(2),
        hold_time: config.hold_time,
        min_rr: config.rr_min
    };
}

// Keep old function for backward compatibility
async function getMarketData(symbol) {
    return getMarketDataMultiTF(symbol, 'scalping');
}

// Helper: Calculate technical indicators
function calculateIndicators(history, currentQuote) {
    if (!history || history.length === 0) {
        return {
            vwap: currentQuote.last,
            rsi: 50,
            macd: { value: 0, signal: 0, histogram: 0 },
            supportLevels: [],
            resistanceLevels: [],
            momentum: 'neutral',
            volumeProfile: 'average',
            trend: 'sideways',
            strength: 50
        };
    }

    const closes = history.map(d => d.close);
    const highs = history.map(d => d.high);
    const lows = history.map(d => d.low);
    const volumes = history.map(d => d.volume);
    const opens = history.map(d => d.open);

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

    // Calculate Stochastic RSI
    const stochRSI = calculateStochasticRSI(closes, 14);

    // Calculate ATR (Average True Range) for volatility
    const atr = calculateATR(highs, lows, closes, 14);

    // Calculate Volume Analysis
    const volumeAnalysis = analyzeVolume(volumes);

    // Calculate Momentum
    const momentum = calculateMomentum(closes, volumes);

    // Find support/resistance with confluence zones
    const supportLevels = findSupportLevelsAdvanced(lows, closes, currentQuote.last);
    const resistanceLevels = findResistanceLevelsAdvanced(highs, closes, currentQuote.last);

    // Trend Analysis
    const trend = analyzeTrend(closes, highs, lows);

    // Money Flow Index (MFI) - Volume-weighted RSI
    const mfi = calculateMFI(highs, lows, closes, volumes, 14);

    // Bollinger Bands
    const bb = calculateBollingerBands(closes, 20);

    return {
        vwap: vwap,
        rsi: rsi,
        macd: macd,
        stochRSI: stochRSI,
        atr: atr,
        volumeAnalysis: volumeAnalysis,
        momentum: momentum,
        supportLevels: supportLevels,
        resistanceLevels: resistanceLevels,
        trend: trend,
        mfi: mfi,
        bollingerBands: bb,
        strength: calculateStrength(rsi, macd, momentum, volumeAnalysis)
    };
}

// Helper: Calculate Stochastic RSI
function calculateStochasticRSI(closes, period = 14) {
    if (closes.length < period * 2) return 50;

    // First calculate RSI values
    const rsiValues = [];
    for (let i = period; i < closes.length; i++) {
        const slice = closes.slice(i - period, i + 1);
        rsiValues.push(calculateRSI(slice, period));
    }

    if (rsiValues.length < period) return 50;

    // Calculate Stochastic of RSI
    const recentRSI = rsiValues.slice(-period);
    const minRSI = Math.min(...recentRSI);
    const maxRSI = Math.max(...recentRSI);
    
    if (maxRSI === minRSI) return 50;
    
    const stochRSI = ((rsiValues[rsiValues.length - 1] - minRSI) / (maxRSI - minRSI)) * 100;
    return stochRSI;
}

// Helper: Calculate ATR (Average True Range)
function calculateATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return 0;

    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
        const tr1 = highs[i] - lows[i];
        const tr2 = Math.abs(highs[i] - closes[i - 1]);
        const tr3 = Math.abs(lows[i] - closes[i - 1]);
        trueRanges.push(Math.max(tr1, tr2, tr3));
    }

    const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
    return atr;
}

// Helper: Analyze Volume
function analyzeVolume(volumes) {
    if (volumes.length < 20) return { profile: 'average', trend: 'neutral', strength: 50 };

    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    
    const volumeRatio = recentVolume / avgVolume;
    
    let profile = 'average';
    let strength = 50;
    
    if (volumeRatio > 1.5) {
        profile = 'high';
        strength = 80;
    } else if (volumeRatio > 1.2) {
        profile = 'above-average';
        strength = 65;
    } else if (volumeRatio < 0.7) {
        profile = 'low';
        strength = 30;
    } else if (volumeRatio < 0.85) {
        profile = 'below-average';
        strength = 45;
    }

    // Volume trend
    const firstHalf = volumes.slice(0, Math.floor(volumes.length / 2));
    const secondHalf = volumes.slice(Math.floor(volumes.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    let trend = 'neutral';
    if (secondAvg > firstAvg * 1.2) trend = 'increasing';
    else if (secondAvg < firstAvg * 0.8) trend = 'decreasing';

    return { profile, trend, strength, ratio: volumeRatio };
}

// Helper: Calculate Momentum
function calculateMomentum(closes, volumes) {
    if (closes.length < 10) return { direction: 'neutral', strength: 50, acceleration: 'stable' };

    // Price momentum
    const recentPrice = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const olderPrice = closes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    const priceChange = ((recentPrice - olderPrice) / olderPrice) * 100;

    // Rate of change
    const roc = ((closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10]) * 100;

    let direction = 'neutral';
    let strength = 50;
    
    if (priceChange > 0.5) {
        direction = 'bullish';
        strength = Math.min(50 + (priceChange * 10), 90);
    } else if (priceChange < -0.5) {
        direction = 'bearish';
        strength = Math.max(50 - (Math.abs(priceChange) * 10), 10);
    }

    // Acceleration
    const mid = Math.floor(closes.length / 2);
    const segment1 = closes.slice(0, mid);
    const segment2 = closes.slice(mid);
    const slope1 = (segment1[segment1.length - 1] - segment1[0]) / segment1.length;
    const slope2 = (segment2[segment2.length - 1] - segment2[0]) / segment2.length;
    
    let acceleration = 'stable';
    if (slope2 > slope1 * 1.5) acceleration = 'accelerating';
    else if (slope2 < slope1 * 0.5) acceleration = 'decelerating';

    return { direction, strength, acceleration, roc };
}

// Helper: Find advanced support levels with confluence
function findSupportLevelsAdvanced(lows, closes, currentPrice) {
    const levels = [];
    const recentLows = lows.slice(-100); // More data for better detection
    const recentCloses = closes.slice(-100);
    
    // Find swing lows
    for (let i = 2; i < recentLows.length - 2; i++) {
        if (recentLows[i] < recentLows[i - 1] && 
            recentLows[i] < recentLows[i - 2] &&
            recentLows[i] < recentLows[i + 1] && 
            recentLows[i] < recentLows[i + 2] &&
            recentLows[i] < currentPrice) {
            
            // Check for confluence (multiple touches)
            const levelPrice = recentLows[i];
            const touches = recentLows.filter(low => Math.abs(low - levelPrice) < levelPrice * 0.002).length;
            
            levels.push({
                price: levelPrice,
                strength: touches,
                type: 'swing-low'
            });
        }
    }

    // Find VWAP support
    let vwapSum = 0;
    let volSum = 0;
    for (let i = 0; i < recentCloses.length; i++) {
        vwapSum += recentCloses[i] * (recentLows[i] || 1);
        volSum += (recentLows[i] || 1);
    }
    const vwapLevel = volSum > 0 ? vwapSum / volSum : 0;
    if (vwapLevel < currentPrice && vwapLevel > 0) {
        levels.push({
            price: vwapLevel,
            strength: 3,
            type: 'vwap'
        });
    }

    // Sort by strength and proximity, return top 3
    return levels
        .sort((a, b) => {
            const distanceA = currentPrice - a.price;
            const distanceB = currentPrice - b.price;
            return (b.strength - a.strength) || (distanceA - distanceB);
        })
        .slice(0, 3)
        .map(l => ({
            price: parseFloat(l.price.toFixed(2)),
            strength: l.strength >= 3 ? 'strong' : l.strength >= 2 ? 'moderate' : 'weak',
            type: l.type
        }));
}

// Helper: Find advanced resistance levels
function findResistanceLevelsAdvanced(highs, closes, currentPrice) {
    const levels = [];
    const recentHighs = highs.slice(-100);
    const recentCloses = closes.slice(-100);
    
    // Find swing highs
    for (let i = 2; i < recentHighs.length - 2; i++) {
        if (recentHighs[i] > recentHighs[i - 1] && 
            recentHighs[i] > recentHighs[i - 2] &&
            recentHighs[i] > recentHighs[i + 1] && 
            recentHighs[i] > recentHighs[i + 2] &&
            recentHighs[i] > currentPrice) {
            
            const levelPrice = recentHighs[i];
            const touches = recentHighs.filter(high => Math.abs(high - levelPrice) < levelPrice * 0.002).length;
            
            levels.push({
                price: levelPrice,
                strength: touches,
                type: 'swing-high'
            });
        }
    }

    // Sort and return top 3
    return levels
        .sort((a, b) => {
            const distanceA = a.price - currentPrice;
            const distanceB = b.price - currentPrice;
            return (b.strength - a.strength) || (distanceA - distanceB);
        })
        .slice(0, 3)
        .map(l => ({
            price: parseFloat(l.price.toFixed(2)),
            strength: l.strength >= 3 ? 'strong' : l.strength >= 2 ? 'moderate' : 'weak',
            type: l.type
        }));
}

// Helper: Analyze Trend
function analyzeTrend(closes, highs, lows) {
    if (closes.length < 20) return { direction: 'sideways', strength: 'weak' };

    // EMA 20 and 50
    const ema20 = calculateEMA(closes, 20);
    const ema50 = closes.length >= 50 ? calculateEMA(closes, 50) : ema20;
    
    // Current price vs EMAs
    const currentPrice = closes[closes.length - 1];
    
    // Higher highs and higher lows (uptrend)
    const recentHighs = highs.slice(-10);
    const recentLows = lows.slice(-10);
    
    const higherHighs = recentHighs.slice(-3).every((h, i) => i === 0 || h >= recentHighs.slice(-3)[i - 1]);
    const higherLows = recentLows.slice(-3).every((l, i) => i === 0 || l >= recentLows.slice(-3)[i - 1]);
    
    const lowerHighs = recentHighs.slice(-3).every((h, i) => i === 0 || h <= recentHighs.slice(-3)[i - 1]);
    const lowerLows = recentLows.slice(-3).every((l, i) => i === 0 || l <= recentLows.slice(-3)[i - 1]);

    let direction = 'sideways';
    let strength = 'weak';

    if (higherHighs && higherLows && currentPrice > ema20 && ema20 > ema50) {
        direction = 'uptrend';
        strength = 'strong';
    } else if (lowerHighs && lowerLows && currentPrice < ema20 && ema20 < ema50) {
        direction = 'downtrend';
        strength = 'strong';
    } else if (currentPrice > ema20) {
        direction = 'uptrend';
        strength = 'moderate';
    } else if (currentPrice < ema20) {
        direction = 'downtrend';
        strength = 'moderate';
    }

    return { direction, strength, ema20, ema50 };
}

// Helper: Calculate MFI (Money Flow Index)
function calculateMFI(highs, lows, closes, volumes, period = 14) {
    if (highs.length < period + 1) return 50;

    const typicalPrices = [];
    const moneyFlows = [];
    
    for (let i = 0; i < highs.length; i++) {
        const tp = (highs[i] + lows[i] + closes[i]) / 3;
        typicalPrices.push(tp);
        moneyFlows.push(tp * volumes[i]);
    }

    let positiveFlow = 0;
    let negativeFlow = 0;

    for (let i = typicalPrices.length - period; i < typicalPrices.length; i++) {
        if (i > 0) {
            if (typicalPrices[i] > typicalPrices[i - 1]) {
                positiveFlow += moneyFlows[i];
            } else {
                negativeFlow += moneyFlows[i];
            }
        }
    }

    if (negativeFlow === 0) return 100;
    
    const moneyRatio = positiveFlow / negativeFlow;
    const mfi = 100 - (100 / (1 + moneyRatio));

    return mfi;
}

// Helper: Calculate Bollinger Bands
function calculateBollingerBands(closes, period = 20) {
    if (closes.length < period) {
        const current = closes[closes.length - 1];
        return { upper: current * 1.02, middle: current, lower: current * 0.98, width: 4 };
    }

    const recentCloses = closes.slice(-period);
    const sma = recentCloses.reduce((a, b) => a + b, 0) / period;
    
    const squaredDiffs = recentCloses.map(close => Math.pow(close - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = sma + (stdDev * 2);
    const lower = sma - (stdDev * 2);
    const width = ((upper - lower) / sma) * 100;

    const current = closes[closes.length - 1];
    let position = 'middle';
    if (current > sma + stdDev) position = 'upper';
    else if (current < sma - stdDev) position = 'lower';

    return { upper, middle: sma, lower, width, position };
}

// Helper: Calculate overall strength
function calculateStrength(rsi, macd, momentum, volumeAnalysis) {
    let score = 50;

    // RSI component
    if (rsi > 50) score += (rsi - 50) * 0.4;
    else score -= (50 - rsi) * 0.4;

    // MACD component
    if (macd.histogram > 0) score += 10;
    else score -= 10;

    // Momentum component
    if (momentum.direction === 'bullish') score += 15;
    else if (momentum.direction === 'bearish') score -= 15;

    // Volume component
    score += (volumeAnalysis.strength - 50) * 0.3;

    return Math.max(10, Math.min(90, score));
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

// Helper: Analyze with text and multiple timeframes
async function analyzeTextMultiTF(symbol, direction = null, tradingStyle = 'scalping') {
    try {
        const marketData = await getMarketDataMultiTF(symbol, tradingStyle);
        
        // Use HTF indicators for main analysis
        const indicators = marketData.htf.indicators;
        
        // Get emoji indicators
        const trendEmoji = indicators.trend.direction === 'uptrend' ? '📈' : 
                          indicators.trend.direction === 'downtrend' ? '📉' : '➡️';
        const momentumEmoji = indicators.momentum.direction === 'bullish' ? '🟢' : 
                             indicators.momentum.direction === 'bearish' ? '🔴' : '🟡';
        const volumeEmoji = indicators.volumeAnalysis.profile === 'high' ? '🔥' :
                           indicators.volumeAnalysis.profile === 'above-average' ? '⬆️' :
                           indicators.volumeAnalysis.profile === 'below-average' ? '⬇️' : '📊';
        const strengthEmoji = indicators.strength >= 70 ? '💪' :
                             indicators.strength >= 50 ? '👍' : '⚠️';
        
        // Trading style emoji
        const styleEmoji = {
            'scalping': '⚡',
            'daytrading': '📊',
            'swing': '📈'
        }[tradingStyle] || '📊';
        
        // Format support/resistance with emojis
        const supportText = indicators.supportLevels && indicators.supportLevels.length > 0
            ? indicators.supportLevels.map(s => 
                `   ${s.strength === 'strong' ? '🛡️' : s.strength === 'moderate' ? '🔵' : '⚪'} $${s.price} (${s.strength} ${s.type})`
              ).join('\n')
            : '   ⚪ No clear support detected (limited data)';
        
        const resistanceText = indicators.resistanceLevels && indicators.resistanceLevels.length > 0
            ? indicators.resistanceLevels.map(r => 
                `   ${r.strength === 'strong' ? '🚧' : r.strength === 'moderate' ? '🟠' : '⚪'} $${r.price} (${r.strength} ${r.type})`
              ).join('\n')
            : '   ⚪ No clear resistance detected (limited data)';
        
        console.log('Support levels found:', indicators.supportLevels?.length || 0);
        console.log('Resistance levels found:', indicators.resistanceLevels?.length || 0);

        const prompt = `Phân tích ${tradingStyle.toUpperCase()} chuyên nghiệp cho ${symbol}${direction ? ' - ' + direction : ''}:

${styleEmoji} *TRADING STYLE: ${tradingStyle.toUpperCase()}*
⏱️ Hold time: ${marketData.targets.hold_time}
🎯 Risk/Reward: Minimum ${marketData.targets.min_rr}:1

📊 MARKET DATA:
• Price: $${marketData.price}
• Change: ${marketData.changePercent >= 0 ? '🟢' : '🔴'} ${marketData.changePercent}%
• Volume: ${volumeEmoji} ${marketData.volume?.toLocaleString()} (${indicators.volumeAnalysis.profile})
• Session: ${marketData.marketSession}

📈 HTF (${marketData.htf.interval}) - TREND ANALYSIS:
• Direction: ${trendEmoji} ${indicators.trend.direction} (${indicators.trend.strength})
• EMA20: $${indicators.trend.ema20?.toFixed(2) || 'N/A'}
• Momentum: ${momentumEmoji} ${indicators.momentum.direction} (${indicators.momentum.acceleration})
• Strength: ${strengthEmoji} ${indicators.strength.toFixed(0)}/100

📊 LTF (${marketData.ltf.interval}) - ENTRY TIMING:
• RSI: ${marketData.ltf.indicators.rsi.toFixed(1)} ${marketData.ltf.indicators.rsi > 70 ? '🔴' : marketData.ltf.indicators.rsi < 30 ? '🟢' : '🟡'}
• Stoch RSI: ${marketData.ltf.indicators.stochRSI.toFixed(1)} ${marketData.ltf.indicators.stochRSI > 80 ? '⚠️' : marketData.ltf.indicators.stochRSI < 20 ? '⚡' : '➡️'}
• MACD: ${marketData.ltf.indicators.macd.histogram >= 0 ? '🟢' : '🔴'} ${marketData.ltf.indicators.macd.histogram.toFixed(4)}

📊 TECHNICAL INDICATORS:
• MFI(14): ${indicators.mfi.toFixed(1)} ${indicators.mfi > 80 ? '💰 Strong buying' : indicators.mfi < 20 ? '📉 Strong selling' : '➡️ Balanced'}
• ATR: ${indicators.atr.toFixed(2)} (volatility)
• BB Position: ${indicators.bollingerBands.position === 'upper' ? '🔴 Near upper' : indicators.bollingerBands.position === 'lower' ? '🟢 Near lower' : '🟡 Middle'}

💹 KEY LEVELS:
• VWAP: $${indicators.vwap.toFixed(2)} ${marketData.price > indicators.vwap ? '(Above ✅)' : '(Below ⚠️)'}

🛡️ SUPPORT LEVELS:
${supportText}

🚧 RESISTANCE LEVELS:
${resistanceText}

🔄 VOLUME ANALYSIS:
• Profile: ${volumeEmoji} ${indicators.volumeAnalysis.profile}
• Trend: ${indicators.volumeAnalysis.trend === 'increasing' ? '📈 Increasing' : indicators.volumeAnalysis.trend === 'decreasing' ? '📉 Decreasing' : '➡️ Stable'}

🎯 CALCULATED TARGETS (ATR-Adjusted):
• Entry: $${marketData.targets.entry}
• TP1: $${marketData.targets.tp1} (+${marketData.targets.tp1_percent}%) [R:R ${marketData.targets.rr1}:1]
• TP2: $${marketData.targets.tp2} (+${marketData.targets.tp2_percent}%) [R:R ${marketData.targets.rr2}:1]
• SL: $${marketData.targets.sl} (${marketData.targets.sl_percent}%)
• Risk: $${marketData.targets.risk_amount} | Reward: $${marketData.targets.reward2_amount}

📋 YÊU CẦU PHÂN TÍCH:
Dựa trên ${tradingStyle} setup (hold ${marketData.targets.hold_time}), đưa ra:

1. 🎯 Direction: CALL hay PUT
2. 💭 Lý do chính dựa trên HTF trend + LTF entry timing
3. ✅ Entry confirmation: HTF aligned? LTF signal clear?
4. 📊 Verify TP/SL levels (có hợp lý với R:R >=${marketData.targets.min_rr}:1?)
5. ⚠️ Conflicts/Warnings (nếu có)
6. 💯 Confidence score (${tradingStyle === 'scalping' ? '>75%' : tradingStyle === 'daytrading' ? '>70%' : '>65%'} mới trade)
7. ⏱️ Hold time target: ${marketData.targets.hold_time}

CHÚ Ý:
- ${tradingStyle === 'scalping' ? 'SCALPING: TP/SL rất tight, cần volume cao + clear signal' : 
  tradingStyle === 'daytrading' ? 'DAY TRADING: Cần HTF trend + LTF confirmation' :
  'SWING: Focus HTF trend, bỏ qua LTF noise'}
- R:R minimum: ${marketData.targets.min_rr}:1
- HTF = trend bias, LTF = entry timing`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `Bạn là chuyên gia ${tradingStyle} chuyên nghiệp. Phân tích NGẮN GỌN, RÕ RÀNG với EMOJI.
                    
${tradingStyle === 'scalping' ? 
`SCALPING (5-15 phút):
- Tight TP/SL (0.3-0.6%)
- Cần volume CAO 🔥
- LTF signal rất quan trọng
- Exit nhanh, không hold` :
tradingStyle === 'daytrading' ?
`DAY TRADING (30-90 phút):
- Moderate TP/SL (0.8-1.5%)
- HTF trend + LTF entry
- Có thể scale out
- Monitor trong ngày` :
`SWING TRADING (1-5 ngày):
- Wider TP/SL (2-5%)
- HTF trend là chính
- Bỏ qua LTF noise
- Set & forget`}

Format với emoji rõ ràng. Confidence score phải match trading style.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 1200,
            temperature: 0.3
        });

        return {
            analysis: response.choices[0].message.content,
            marketData: marketData,
            tradingStyle: tradingStyle
        };
    } catch (error) {
        console.error('Text analysis error:', error.message);
        throw error;
    }
}

// Keep old function for backward compatibility
async function analyzeText(symbol, direction = null) {
    return analyzeTextMultiTF(symbol, direction, 'scalping');
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

// Command: /test (debug Tradier connection)
bot.onText(/\/test/, async (msg) => {
    const chatId = msg.chat.id;
    
    const debugInfo = `🔍 *Configuration Check*

📊 Tradier API:
• Sandbox mode: ${USE_SANDBOX ? 'YES ✅' : 'NO'}
• Base URL: \`${BASE_URL}\`
• API Key set: ${process.env.TRADIER_API_KEY ? 'YES ✅' : 'NO ❌'}
• Key length: ${process.env.TRADIER_API_KEY?.length || 0} chars

🤖 OpenAI:
• API Key set: ${process.env.OPENAI_API_KEY ? 'YES ✅' : 'NO ❌'}

📱 Telegram:
• Bot Token set: ${process.env.BOT_TOKEN ? 'YES ✅' : 'NO ❌'}

Testing Tradier connection...`;

    await bot.sendMessage(chatId, debugInfo, { parse_mode: 'Markdown' });
    
    try {
        const testData = await getMarketData('SPY');
        
        const supportInfo = testData.indicators.supportLevels && testData.indicators.supportLevels.length > 0
            ? testData.indicators.supportLevels.map(s => `\n• $${s.price} (${s.strength} ${s.type})`).join('')
            : '\n• None detected';
        
        const resistanceInfo = testData.indicators.resistanceLevels && testData.indicators.resistanceLevels.length > 0
            ? testData.indicators.resistanceLevels.map(r => `\n• $${r.price} (${r.strength} ${r.type})`).join('')
            : '\n• None detected';
        
        const successMsg = `✅ *Tradier Connection: SUCCESS!*

💰 SPY Data Retrieved:
• Price: $${testData.price}
• Change: ${testData.changePercent}%
• Volume: ${testData.volume?.toLocaleString()}
• Session: ${testData.marketSession}
• Data interval: ${testData.dataInterval}

📊 Indicators Test:
• RSI: ${testData.indicators.rsi.toFixed(1)}
• MACD: ${testData.indicators.macd.histogram.toFixed(4)}
• MFI: ${testData.indicators.mfi.toFixed(1)}
• Trend: ${testData.indicators.trend.direction}

🛡️ Support levels:${supportInfo}

🚧 Resistance levels:${resistanceInfo}

🎉 Everything working! Try \`/analyze SPY\``;
        
        bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
    } catch (error) {
        const errorMsg = `❌ *Tradier Connection: FAILED*

Error: ${error.message}

🔧 Check Railway logs for details.
Make sure:
• TRADIER_API_KEY is set correctly
• TRADIER_SANDBOX=true (for sandbox)
• Token is valid`;
        
        bot.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
    }
});

// Command: /analyze or /scalp or /check (text analysis) - defaults to scalping
bot.onText(/\/(analyze|check)\s+([A-Z]+)(\s+(CALL|PUT))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = match[2].toUpperCase();
    const direction = match[4] ? match[4].toUpperCase() : null;

    const processingMsg = await bot.sendMessage(
        chatId,
        `⚡ Analyzing ${symbol}${direction ? ' ' + direction : ''} (SCALPING mode)...\n⏱️ 10-15 seconds...`
    );

    try {
        const result = await analyzeTextMultiTF(symbol, direction, 'scalping');
        await displayAnalysis(chatId, processingMsg.message_id, result, symbol);
    } catch (error) {
        await bot.deleteMessage(chatId, processingMsg.message_id);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// Command: /scalp - explicit scalping mode
bot.onText(/\/scalp\s+([A-Z]+)(\s+(CALL|PUT))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = match[1].toUpperCase();
    const direction = match[3] ? match[3].toUpperCase() : null;

    const processingMsg = await bot.sendMessage(
        chatId,
        `⚡ Scalping analysis for ${symbol}${direction ? ' ' + direction : ''}...\n⏱️ 10-15 seconds...`
    );

    try {
        const result = await analyzeTextMultiTF(symbol, direction, 'scalping');
        await displayAnalysis(chatId, processingMsg.message_id, result, symbol);
    } catch (error) {
        await bot.deleteMessage(chatId, processingMsg.message_id);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// Command: /daytrade - day trading analysis
bot.onText(/\/daytrade\s+([A-Z]+)(\s+(CALL|PUT))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = match[1].toUpperCase();
    const direction = match[3] ? match[3].toUpperCase() : null;

    const processingMsg = await bot.sendMessage(
        chatId,
        `📊 Day trading analysis for ${symbol}${direction ? ' ' + direction : ''}...\n⏱️ 15-20 seconds...`
    );

    try {
        const result = await analyzeTextMultiTF(symbol, direction, 'daytrading');
        await displayAnalysis(chatId, processingMsg.message_id, result, symbol);
    } catch (error) {
        await bot.deleteMessage(chatId, processingMsg.message_id);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// Command: /swing - swing trading analysis
bot.onText(/\/swing\s+([A-Z]+)(\s+(CALL|PUT))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = match[1].toUpperCase();
    const direction = match[3] ? match[3].toUpperCase() : null;

    const processingMsg = await bot.sendMessage(
        chatId,
        `📈 Swing trading analysis for ${symbol}${direction ? ' ' + direction : ''}...\n⏱️ 15-20 seconds...`
    );

    try {
        const result = await analyzeTextMultiTF(symbol, direction, 'swing');
        await displayAnalysis(chatId, processingMsg.message_id, result, symbol);
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
        
        // Get EST time
        const estTime = new Date().toLocaleString('en-US', { 
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        const response = `${analysisType === 'full' ? '📊 FULL' : '⭐ SIGNAL'} *VISUAL ANALYSIS*

${analysis}

⏰ Analyzed at: ${estTime} EST`;

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
const startTime = new Date().toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    dateStyle: 'full',
    timeStyle: 'long'
});

console.log('🤖 Professional Scalping Bot started!');
console.log('📊 Using Tradier API');
console.log('👁️ Using OpenAI Vision (gpt-4o)');
console.log('🌍 Bot available 24/7 - Monitors market hours automatically');
console.log('✅ Ready to scalp!');
console.log(`Current session: ${getMarketSession().toUpperCase()}`);
console.log(`EST Time: ${startTime}`);

// Helper: Display analysis results
async function displayAnalysis(chatId, processingMsgId, result, symbol) {
    const marketWarning = !result.marketData.isMarketOpen ? 
        `\n⚠️ *Market ${result.marketData.marketSession.toUpperCase()}*\n⏸️ Using last close data - Not tradeable now!\n` : '';
    
    // Get EST time
    const estTime = new Date().toLocaleString('en-US', { 
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    
    // Get emojis
    const sessionEmoji = {
        'pre-market': '🌅',
        'regular': '📈',
        'after-hours': '🌆',
        'closed': '🌙'
    }[result.marketData.marketSession] || '📊';
    
    const trendEmoji = result.marketData.htf.indicators.trend.direction === 'uptrend' ? '📈' : 
                      result.marketData.htf.indicators.trend.direction === 'downtrend' ? '📉' : '➡️';
    
    const changeEmoji = result.marketData.changePercent >= 0 ? '🟢' : '🔴';
    
    const styleEmoji = {
        'scalping': '⚡',
        'daytrading': '📊',
        'swing': '📈'
    }[result.tradingStyle] || '📊';
    
    const styleName = result.tradingStyle.toUpperCase();
    
    const response = `${styleEmoji} *${symbol} ${styleName} ANALYSIS*
${marketWarning}        
${result.analysis}

━━━━━━━━━━━━━━━━━━━
💰 *QUICK STATS:*
${changeEmoji} Price: $${result.marketData.price} (${result.marketData.dataAge === 'last-close' ? '⏸️ Last Close' : '⚡ Live'})
${trendEmoji} HTF Trend: ${result.marketData.htf.indicators.trend.direction}
📊 Change: ${changeEmoji} ${result.marketData.changePercent}%
💹 VWAP: $${result.marketData.htf.indicators.vwap.toFixed(2)}
${sessionEmoji} Session: ${result.marketData.marketSession}

🎯 *TARGETS (R:R ${result.marketData.targets.rr2}:1):*
💰 Entry: $${result.marketData.targets.entry}
🎯 TP1: $${result.marketData.targets.tp1} (+${result.marketData.targets.tp1_percent}%)
🎯 TP2: $${result.marketData.targets.tp2} (+${result.marketData.targets.tp2_percent}%)
🛑 SL: $${result.marketData.targets.sl} (${result.marketData.targets.sl_percent}%)
⏱️ Hold: ${result.marketData.targets.hold_time}

📊 *TIMEFRAMES:*
HTF (${result.marketData.htf.interval}) + LTF (${result.marketData.ltf.interval})

⏰ Analyzed at: ${estTime} EST`;

    await bot.deleteMessage(chatId, processingMsgId);
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
}
