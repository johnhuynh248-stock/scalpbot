# ⚡ Quick Reference Card

## 🎯 Analysis Commands

### Text Analysis (10-15 seconds)
```
/analyze SPY
/scalp TSLA CALL
/check AAPL
```

### Signal Screenshot (15-25 seconds)
Send 1 trading signal image → Get analysis

### Full Visual Analysis (20-35 seconds)
Send 3 images (HTF/LTF/Indicators) → Comprehensive analysis

## 📈 Trade Tracking

### Add Trade
```
/enter SPY CALL 585.50
/enter TSLA PUT 850.00
```

### Monitor Trades
```
/check          # See all trades with live P/L
/status         # Same as /check
/trades         # List all positions
```

### Close Trade
```
/close SPY
/close TSLA
```

## ℹ️ Information

```
/start          # Welcome message
/help           # Full guide
/session        # Current market session
```

## 🎯 Scalping Rules

### Entry Checklist
- ✅ Price above/below VWAP
- ✅ HTF structure aligned
- ✅ LTF confirmation present
- ✅ No conflicts
- ✅ Confidence >70%

### Position Sizing
- **DTE**: 1-3 days only
- **Delta**: 0.45-0.65
- **Strike**: ATM or 1 OTM

### Profit Targets
- **TP1**: +0.5-0.8% (10-20 min)
- **TP2**: +1.0-1.5% (15-30 min)
- **SL**: -0.7-0.8%
- **Time Stop**: 30 minutes

### Exit Strategy
1. TP1 hit → Take 60-80% profit
2. TP2 hit → Exit remaining
3. SL hit → Cut immediately
4. 30 min → Exit regardless

## 💰 Risk Management

- Max 2% risk per trade
- 3 losses in a day = stop
- Target 65%+ win rate
- Min 1.5:1 R:R ratio

## 📊 Example Workflow

```
1. Get Signal
   → /analyze SPY
   → Bot responds in 10s

2. Execute on Broker
   → Buy SPY 586C 2DTE @ $2.90

3. Track Position
   → /enter SPY CALL 585.50
   → Bot calculates TP/SL

4. Monitor Live
   → /check
   → See real-time P/L

5. Take Profits
   → TP1 @ +8% → Sell 70%
   → TP2 @ +15% → Sell 30%

6. Close Tracking
   → /close SPY
```

## 🚨 Common Mistakes

❌ **Don't:**
- Trade 0DTE options
- Hold past 30 minutes
- Ignore stop losses
- Trade with <70% confidence
- Trade against HTF structure

✅ **Do:**
- Use 1-3 DTE options
- Exit at time stops
- Cut losses immediately
- Wait for high confidence
- Align with HTF

## 🔧 Troubleshooting

**Bot not responding?**
- Check /start works
- Verify bot is online
- Test with simple command

**Analysis fails?**
- Use valid symbols (SPY, TSLA)
- Check image is clear
- Add symbol in caption

**Trade tracking issues?**
- Format: /enter SYMBOL CALL/PUT PRICE
- Use numbers only (585.50 not $585.50)
- Check symbol is valid

## 📱 Best Sessions

**Best for Scalping:**
- 9:30-11:00 AM EST (Market open)
- 2:00-4:00 PM EST (Close)

**Avoid:**
- 11:30 AM-1:30 PM EST (Lunch)
- Pre-market/After-hours
- Low volume days
- Major news events (unless experienced)

## 🎓 Pro Tips

1. **Wait for Setup**
   - Don't force trades
   - High confidence only

2. **Scale Out**
   - Take profits gradually
   - Secure gains early

3. **Time Management**
   - 30 min max hold
   - Don't marry positions

4. **Loss Control**
   - 3 losses = done
   - Come back tomorrow

5. **Journal Trades**
   - Track win rate
   - Learn from losses
   - Refine strategy

## 📊 Key Indicators

**VWAP**
- Above = Bullish bias
- Below = Bearish bias

**RSI**
- >70 = Overbought
- <30 = Oversold
- 50 = Neutral

**MACD**
- Positive = Bullish
- Negative = Bearish
- Crossing = Signal

## 🎯 Target Metrics

- **Win Rate**: 65%+
- **Avg Hold**: 15-30 min
- **Risk/Reward**: 1.5:1 min
- **Max Drawdown**: 6%
- **Daily Target**: 3-5 trades

## 💡 Remember

> "The goal isn't to trade a lot, it's to trade well."

- Quality > Quantity
- Patience pays
- Protect capital first
- Profits will follow

---

**Quick Access:**
- 🎯 Analysis: `/analyze SYMBOL`
- 📈 Track: `/enter SYMBOL CALL/PUT PRICE`
- 📊 Monitor: `/check`
- ℹ️ Help: `/help`

**Happy scalping! 🚀📈**
