# 🚀 Railway Deployment Guide

Complete guide to deploying your Professional Scalping Bot on Railway.

## 📋 Prerequisites

Before deploying, you need:

1. **Telegram Bot Token**
   - Message @BotFather on Telegram
   - Send `/newbot`
   - Follow instructions
   - Copy the token

2. **OpenAI API Key**
   - Visit https://platform.openai.com/api-keys
   - Create new secret key
   - Copy and save securely
   - Ensure you have credits ($5+ recommended)

3. **Tradier API Key**
   - Visit https://developer.tradier.com/
   - Sign up for free sandbox account
   - Navigate to API Access
   - Copy your access token
   - For production: Upgrade to live account

4. **Railway Account**
   - Visit https://railway.app/
   - Sign up with GitHub (recommended)
   - Free tier: $5 credit/month
   - Enough for 24/7 bot operation

## 🎯 Quick Deploy (5 Minutes)

### Method 1: GitHub Repository (Recommended)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin your-repo-url
   git push -u origin main
   ```

2. **Deploy on Railway**
   - Go to https://railway.app/new
   - Click "Deploy from GitHub repo"
   - Select your repository
   - Railway auto-detects Node.js project

3. **Set Environment Variables**
   - Go to your project → Variables
   - Add these variables:
     ```
     BOT_TOKEN = your_telegram_bot_token
     OPENAI_API_KEY = your_openai_api_key
     TRADIER_API_KEY = your_tradier_api_key
     TRADIER_SANDBOX = true
     ```

4. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes
   - Check logs for "✅ Ready to scalp!"

### Method 2: Direct File Upload

1. **Login to Railway**
   - Visit https://railway.app/
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose "Empty Project"

2. **Upload Files**
   - Click "Add Service" → "Empty Service"
   - Go to Settings → Source
   - Upload these 5 files:
     - `index.js`
     - `package.json`
     - `nixpacks.toml`
     - `.env.example` (rename to .env after)
     - `.gitignore`

3. **Configure Environment**
   - Go to Variables tab
   - Click "Raw Editor"
   - Paste:
     ```
     BOT_TOKEN=your_telegram_bot_token
     OPENAI_API_KEY=your_openai_api_key
     TRADIER_API_KEY=your_tradier_api_key
     TRADIER_SANDBOX=true
     ```

4. **Deploy**
   - Railway auto-deploys
   - Check deployment logs

## 🔧 Configuration Details

### Environment Variables Explained

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BOT_TOKEN` | ✅ | Telegram bot token | `123456:ABC-DEF...` |
| `OPENAI_API_KEY` | ✅ | OpenAI API key | `sk-proj-...` |
| `TRADIER_API_KEY` | ✅ | Tradier API token | `Bearer ABC123...` |
| `TRADIER_SANDBOX` | ❌ | Use sandbox (true/false) | `true` |
| `OWNER_ID` | ❌ | Restrict to user ID | `123456789` |

### Getting Your Telegram User ID

1. Message @userinfobot on Telegram
2. Copy your user ID
3. Add to `OWNER_ID` variable (optional)
4. Leave empty to allow all users

### Tradier API Setup

**For Testing (Free Sandbox):**
1. Sign up at https://developer.tradier.com/
2. Get sandbox token
3. Set `TRADIER_SANDBOX=true`
4. Test all features (delayed data)

**For Production (Real Data):**
1. Upgrade to live account
2. Get production token
3. Set `TRADIER_SANDBOX=false`
4. Real-time market data

## 📊 Deployment Verification

### Step 1: Check Logs

Railway logs should show:
```
🤖 Professional Scalping Bot started!
📊 Using Tradier API
👁️ Using OpenAI Vision (gpt-4o)
✅ Ready to scalp!
```

### Step 2: Test Bot

1. Open Telegram
2. Search for your bot
3. Send `/start`
4. Should receive welcome message

### Step 3: Test Analysis

```
/analyze SPY
```

Should return analysis in 10-15 seconds.

### Step 4: Test Image Analysis

1. Send a chart screenshot
2. Should analyze in 15-25 seconds

## 🛠️ Troubleshooting

### Bot Not Starting

**Error: Missing BOT_TOKEN**
```
Solution: Add BOT_TOKEN to environment variables
```

**Error: Polling error**
```
Solution: Check BOT_TOKEN is valid
- Get new token from @BotFather
- Make sure no spaces in token
```

### Analysis Fails

**Error: Invalid symbol**
```
Solution: Use valid stock tickers
- ✅ SPY, TSLA, AAPL, NVDA
- ❌ S&P500, Tesla Inc
```

**Error: OpenAI API error**
```
Solution: Check API key and credits
- Verify key at https://platform.openai.com/api-keys
- Add credits if balance is $0
- Recommended: $5+ for testing
```

**Error: Tradier API error**
```
Solution: Verify Tradier credentials
- Check API key is correct
- Verify sandbox vs production setting
- Test at https://developer.tradier.com/documentation
```

### Deployment Issues

**Build fails**
```
Solution: Check package.json
- Make sure all dependencies listed
- Verify Node.js version >=18
```

**Bot runs but no responses**
```
Solution: Check environment variables
- All required vars set?
- No typos in variable names?
- Values have no quotes?
```

**Timeout errors**
```
Solution: Railway plan limits
- Free tier: 500 hours/month
- Upgrade if needed
- Check usage in Railway dashboard
```

## 💰 Cost Breakdown

### Railway
- **Free Tier**: $5 credit/month
- **Usage**: ~$0.20/day for 24/7 operation
- **Total**: ~$6/month (need paid plan after free credits)

### OpenAI
- **gpt-4o**: $2.50 per 1M input tokens
- **Vision**: $5.00 per 1M input tokens
- **Estimate**: $5-10/month for moderate use
- **100 analyses/day**: ~$0.50/day

### Tradier
- **Sandbox**: Free (delayed data)
- **Live Real-Time**: $10/month
- **Professional**: Custom pricing

### Total Monthly Cost
- **Testing**: $0 (Railway free + Tradier sandbox)
- **Production**: ~$20-30/month

## 🔄 Updates & Maintenance

### Update Bot Code

**Via GitHub:**
```bash
git add .
git commit -m "Update bot"
git push
```
Railway auto-redeploys.

**Via Railway:**
- Upload new files
- Redeploy manually

### Monitor Performance

**Check Logs:**
- Railway → Your Project → Deployments → View Logs

**Monitor Usage:**
- Railway → Your Project → Metrics
- OpenAI → Usage Dashboard
- Tradier → API Usage Stats

### Backup Configuration

Save your environment variables:
```bash
# On Railway
Variables → Raw Editor → Copy all
```

## 📱 Advanced Configuration

### Enable User Restrictions

```env
OWNER_ID=123456789
```

Only this user can use the bot.

### Adjust Monitoring Interval

Edit `index.js`:
```javascript
}, 15000); // Check every 15 seconds
```

Change to 30000 for 30 seconds, etc.

### Custom Profit Targets

Edit `index.js` in `/enter` command:
```javascript
const tp1 = direction === 'CALL' ? 
    entryPrice * 1.006 : entryPrice * 0.994; // Change multiplier
```

## 🎓 Best Practices

1. **Start with Sandbox**
   - Test all features
   - Learn the system
   - Verify everything works

2. **Monitor API Usage**
   - Check OpenAI credits daily
   - Monitor Railway hours
   - Track Tradier API calls

3. **Use Version Control**
   - Always use GitHub
   - Commit changes regularly
   - Tag stable versions

4. **Keep Secrets Safe**
   - Never commit .env file
   - Use Railway variables
   - Rotate keys periodically

5. **Test Before Production**
   - Test all commands
   - Verify analysis quality
   - Check trade tracking

## 📞 Support Resources

### Documentation
- **Railway**: https://docs.railway.app/
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **OpenAI**: https://platform.openai.com/docs
- **Tradier**: https://documentation.tradier.com/

### Community
- **Railway Discord**: https://discord.gg/railway
- **Telegram Bot Dev**: @BotSupport

### Status Pages
- **Railway**: https://railway.app/status
- **OpenAI**: https://status.openai.com/
- **Tradier**: https://developer.tradier.com/status

## ✅ Deployment Checklist

Before going live:

- [ ] Bot responds to `/start`
- [ ] Text analysis works (`/analyze SPY`)
- [ ] Image analysis works (send screenshot)
- [ ] Trade tracking works (`/enter SPY CALL 585.50`)
- [ ] TP/SL alerts trigger correctly
- [ ] No errors in Railway logs
- [ ] OpenAI credits sufficient
- [ ] Tradier API working
- [ ] User restrictions set (if needed)
- [ ] Monitoring enabled
- [ ] Backup of configuration saved

## 🎉 You're Ready!

Your Professional Scalping Bot is now deployed and ready to analyze the markets 24/7!

**Next Steps:**
1. Join a trading community
2. Test with paper trading
3. Refine your strategy
4. Monitor performance
5. Scale carefully

Happy trading! 🚀📈

---

**Need help?** Check Railway logs first, then review this guide.
