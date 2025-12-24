# 🤖 Professional Scalping Bot v2.0

A sophisticated Telegram bot for real-time stock market scalping analysis with **OpenAI Vision** and **Tradier API** integration.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 What's New in v2.0

- ✅ **OpenAI Vision (gpt-4o)** - Advanced image analysis
- ✅ **Tradier API** - Real-time market data (Railway-compatible)
- ✅ **No Python dependencies** - Pure Node.js solution
- ✅ **Auto-calculated TP/SL** - Smart trade tracking
- ✅ **Vietnamese reasoning** - Clear analysis in your language

## ✨ Features

### 🎯 3 Analysis Methods
1. **⚡ Text Commands** (10-15 seconds) - Fastest
2. **⭐ Signal Screenshots** (15-25 seconds) - Recommended
3. **📊 Full Visual Analysis** (20-35 seconds) - Most comprehensive

### 💎 Professional Analysis
- Real-time Tradier market data
- Auto-calculated support/resistance levels
- VWAP, RSI, and MACD indicators
- Higher timeframe (HTF) structure analysis
- Lower timeframe (LTF) confirmation signals
- Vietnamese reasoning with English terms
- Confidence scoring (>70% = trade)

### 🎯 Scalping Optimization
- Tight profit targets (TP1: +0.5-0.8%, TP2: +1.0-1.5%)
- Quick stop losses (SL: -0.7-0.8%)
- 1-3 DTE options recommendations (delta 0.45-0.65)
- Time-based exits (30-minute stops)
- ATM or 1 strike OTM positioning

### 📊 Trade Tracking
- Auto-calculated TP/SL levels
- Live P/L monitoring every 15 seconds
- Real-time price updates
- Smart alerts (TP1, TP2, SL, time stop)
- Multi-position support

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm 9+
- Telegram account
- OpenAI API key (with credits)
- Tradier API key (free sandbox available)

### Installation

1. **Clone Repository**
```bash
git clone <your-repo-url>
cd scalping-bot-v2
```

2. **Install Dependencies**
```bash
npm install
```

3. **Configure Environment**
```bash
# Copy example env file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

Required variables:
```env
BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=your_openai_api_key
TRADIER_API_KEY=your_tradier_api_key
TRADIER_SANDBOX=true
OWNER_ID=  # Optional - restrict to specific user
```

4. **Run Bot**
```bash
npm start
```

## 🔑 Getting API Keys

### Telegram Bot Token
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Follow instructions
4. Copy the token

### OpenAI API Key
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create new secret key
3. Add credits ($5+ recommended)
4. Copy and save securely

### Tradier API Key
**For Testing (Free):**
1. Visit [Tradier Developer](https://developer.tradier.com/)
2. Sign up for sandbox account
3. Get your access token
4. Set `TRADIER_SANDBOX=true`

**For Production:**
1. Upgrade to live account ($10/month)
2. Get production token
3. Set `TRADIER_SANDBOX=false`

## 🌐 Railway Deployment

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. **Connect GitHub**
   - Push your code to GitHub
   - Connect repository to Railway

2. **Set Environment Variables**
   ```
   BOT_TOKEN = <from @BotFather>
   OPENAI_API_KEY = <from OpenAI>
   TRADIER_API_KEY = <from Tradier>
   TRADIER_SANDBOX = true
   OWNER_ID = <optional>
   ```

3. **Deploy**
   - Railway auto-installs dependencies
   - Bot starts automatically in 2-3 minutes

4. **Verify**
   - Check deployment logs for "✅ Ready to scalp!"
   - Test with `/start` command

### Detailed Guide
See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for step-by-step instructions.

## 📱 Usage

### Text Analysis (Fastest)
```
/analyze SPY
/scalp TSLA CALL
/check AAPL
```

### Signal Screenshot (Recommended)
1. Take screenshot of your trading signal
2. Send to bot (single image)
3. Add symbol in caption: "SPY" or "TSLA"
4. Get analysis in 15-25 seconds

### Full Visual Analysis (Most Detailed)
1. Screenshot 3 charts:
   - Higher timeframe view (5m/15m)
   - Lower timeframe view (1m/2m)
   - Indicators panel
2. Send all 3 in one message
3. Optional: Add symbol in caption
4. Get comprehensive analysis

### Trade Tracking
```bash
# Add trade with auto-calculated levels
/enter SPY CALL 585.50

# Monitor all trades with live P/L
/check

# List active positions
/trades

# Remove trade from tracking
/close SPY
```

## 🎯 Example Workflow

```
1. Get Signal
   → /analyze SPY
   → Response in 10 seconds

2. Execute on Broker
   → Buy SPY 586C 2DTE @ $2.90

3. Track Position
   → /enter SPY CALL 585.50
   → Bot calculates:
      • TP1: $589.01 (+0.6%)
      • TP2: $592.52 (+1.2%)
      • SL: $581.12 (-0.75%)

4. Monitor Live
   → /check
   → See real-time P/L
   → Get alerts when TP/SL hit

5. Take Profits
   → TP1 hits → Bot alerts → Sell 70%
   → TP2 hits → Bot alerts → Sell 30%

6. Close Tracking
   → /close SPY

Total Time: 15-30 minutes
Target Result: 8-15% profit on options
```

## 📊 Commands Reference

### Analysis Commands
| Command | Description | Speed |
|---------|-------------|-------|
| `/analyze SYMBOL` | Quick text analysis | 10-15s |
| `/scalp SYMBOL CALL/PUT` | With direction hint | 10-15s |
| `/check SYMBOL` | Alternative command | 10-15s |
| `(Send 1 image)` | Signal screenshot analysis | 15-25s |
| `(Send 3 images)` | Full visual analysis | 20-35s |

### Trade Tracking Commands
| Command | Description |
|---------|-------------|
| `/enter SYMBOL CALL/PUT PRICE` | Add trade with auto TP/SL |
| `/check` or `/status` | Monitor all trades with live P/L |
| `/trades` | List all active positions |
| `/close SYMBOL` | Remove trade from tracking |

### Info Commands
| Command | Description |
|---------|-------------|
| `/start` | Welcome message and features |
| `/help` | Full usage guide |
| `/session` | Current market session status |

## 🎓 Scalping Strategy

### Entry Rules
✅ Must meet ALL criteria:
- Price above/below VWAP (directional bias)
- HTF structure aligned (5m/15m trend)
- LTF confirmation signal (1m/2m entry)
- No structure conflicts
- Confidence score >70%

### Position Sizing
- **DTE**: 1-3 days only (never 0DTE)
- **Delta**: 0.45-0.65 (optimal range)
- **Strike**: ATM or 1 strike OTM
- **Premium**: Look for $1-5 range

### Exit Strategy
1. **TP1 (+0.5-0.8%)**: Take 60-80% profit (10-20 min target)
2. **TP2 (+1.0-1.5%)**: Exit remaining 20-40% (15-30 min target)
3. **SL (-0.7-0.8%)**: Cut loss immediately if hit
4. **Time Stop**: Exit after 30 min regardless of P/L

### Risk Management
- Max 2% account risk per trade
- 3 losses in a day = stop trading
- Target 65%+ win rate
- Minimum 1.5:1 R:R ratio
- Never average down
- Never remove stops

## 🗺️ Architecture

```
┌──────────────────┐
│  Telegram Bot    │
│   (Node.js)      │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌──────────────┐
│ OpenAI  │ │   Tradier    │
│  Vision │ │  Market API  │
│ (gpt-4o)│ │ (Real-time)  │
└─────────┘ └──────────────┘
    │              │
    └──────┬───────┘
           ▼
    ┌─────────────┐
    │  Analysis   │
    │   Output    │
    └─────────────┘
```

### Tech Stack
- **Bot Framework**: node-telegram-bot-api
- **AI Analysis**: OpenAI gpt-4o (Vision capable)
- **Market Data**: Tradier API (Real-time quotes & history)
- **Language**: Node.js 18+
- **Deployment**: Railway (or any Node.js host)

## 📁 Project Structure

```
scalping-bot-v2/
├── index.js                  # Main bot logic (all-in-one)
├── package.json              # Node.js dependencies
├── nixpacks.toml            # Railway build config
├── .env.example             # Environment template
├── .gitignore               # Git ignore rules
├── README.md                # This file
├── DEPLOYMENT_GUIDE.md      # Detailed deployment steps
└── QUICK_REFERENCE.md       # Quick command reference
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BOT_TOKEN` | ✅ | Telegram bot token | - |
| `OPENAI_API_KEY` | ✅ | OpenAI API key (with credits) | - |
| `TRADIER_API_KEY` | ✅ | Tradier API token | - |
| `TRADIER_SANDBOX` | ❌ | Use sandbox (true) or live (false) | `false` |
| `OWNER_ID` | ❌ | Restrict bot to specific user | - |

### Advanced Settings (in code)

**Trade Monitoring Interval:**
```javascript
}, 15000); // Check every 15 seconds
```

**Profit Target Multipliers:**
```javascript
const tp1 = entryPrice * 1.006;  // +0.6%
const tp2 = entryPrice * 1.012;  // +1.2%
const sl = entryPrice * 0.9925;  // -0.75%
```

**Time Stop Duration:**
```javascript
if (timeElapsed >= 30) { // 30 minutes
```

## 🛠️ Troubleshooting

### Bot Issues

**Bot not responding:**
```
✓ Check BOT_TOKEN is correct
✓ Verify bot is running (check logs)
✓ Try /start command
✓ Make sure bot isn't blocked
```

**Analysis fails:**
```
✓ Use valid symbols (SPY, TSLA, AAPL)
✓ Check OpenAI has credits
✓ Verify image is clear
✓ Add symbol in caption for images
```

**Tradier API errors:**
```
✓ Verify API key is correct
✓ Check sandbox vs production setting
✓ Ensure symbol is valid
✓ Check market hours
```

### Common Errors

**"Invalid symbol"**
- Use stock tickers only (SPY, not S&P 500)
- Check spelling

**"OpenAI API error"**
- Verify API key
- Add credits to account
- Check usage limits

**"Failed to fetch market data"**
- Check Tradier API key
- Verify symbol exists
- Try again (network issue)

**"Invalid entry price"**
- Format: `/enter SPY CALL 585.50`
- Use numbers only (not $585.50)

## 📈 Performance Metrics

### Speed Benchmarks
- Text analysis: 10-15 seconds
- Single image: 15-25 seconds
- Triple image: 20-35 seconds
- Trade update: 3-5 seconds (every 15s)

### Target Trading Metrics
- Win rate: 65%+ (with tight stops)
- Average hold: 15-30 minutes
- Risk/Reward: 1.5:1 minimum
- Max drawdown: 6% (3 losses × 2%)
- Daily trades: 3-5 quality setups

## 💰 Cost Breakdown

### Monthly Costs

**Railway Hosting:**
- Free tier: $5 credit/month
- Paid: ~$10/month for 24/7 uptime

**OpenAI API:**
- gpt-4o: $2.50 per 1M input tokens
- Vision: $5.00 per 1M input tokens
- Estimate: $5-10/month (moderate use)
- ~100 analyses/day = $0.50/day

**Tradier API:**
- Sandbox: Free (delayed data)
- Live: $10/month (real-time data)

**Total:**
- Testing: ~$5/month (Railway + OpenAI)
- Production: ~$20-30/month (all services)

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## ⚠️ Disclaimer

**IMPORTANT:** This bot is for educational and informational purposes only. It does NOT constitute financial advice.

Trading stocks and options involves substantial risk of loss. Always:
- ✅ Do your own research and due diligence
- ✅ Manage risk appropriately
- ✅ Never trade with money you can't afford to lose
- ✅ Start with paper trading
- ✅ Consult a licensed financial advisor
- ✅ Understand that past performance doesn't guarantee future results

The creators and contributors of this bot are NOT responsible for any trading losses incurred while using this software.

## 🙏 Acknowledgments

- **OpenAI** for GPT-4o Vision API
- **Tradier** for market data API
- **Telegram** for Bot API
- **Railway** for hosting platform
- **Node.js Community** for excellent packages

## 📞 Support

- 📖 [Deployment Guide](DEPLOYMENT_GUIDE.md) - Full setup instructions
- ⚡ [Quick Reference](QUICK_REFERENCE.md) - Command cheat sheet
- 🐛 Issues - Use GitHub Issues for bugs
- 💬 Discussions - Use GitHub Discussions for questions

## 🎯 Roadmap

- [ ] Multi-user support with individual trade tracking
- [ ] Advanced backtesting integration
- [ ] Portfolio analytics dashboard
- [ ] Discord bot version
- [ ] Paper trading integration
- [ ] Broker API integration (auto-execution)
- [ ] Machine learning signal quality scoring
- [ ] Custom indicator support

---

**Built with ❤️ for professional scalpers**

*Trade smart. Trade safe. Happy scalping! 🚀📈*

**Version 2.0** | Node.js + OpenAI Vision + Tradier API | Railway Ready
