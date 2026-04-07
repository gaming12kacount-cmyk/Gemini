# 🤖 Gemini AI Telegram Bot v3.0

Telegram bot powered by **Google Gemini 1.5 Flash** (free tier).  
Ready to deploy on **Render** (free web service).

---

## ✨ Features

| Feature | Command / Action |
|---|---|
| Chat with Gemini AI | Just send any message |
| Image analysis | Send any photo (optionally add a caption/question) |
| File summarisation | Send a text/code/CSV/JSON file |
| Translation (6 langs) | `/translate bn Hello world` |
| Creative writing | `/imagine a city in the clouds` |
| Code help | `/code how to reverse a string in Python` |
| Conversation summary | `/history` |
| Language picker | `/lang` |
| Clear memory | `/clear` |

**Languages:** English 🇬🇧 · বাংলা 🇧🇩 · اردو 🇵🇰 · العربية 🇸🇦 · हिंदी 🇮🇳 · 中文 🇨🇳

---

## 🚀 Deploy on Render

### Step 1 — Create a Telegram Bot
1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the steps
3. Copy the **Bot Token** you receive

### Step 2 — Get a Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **Create API key** (free, no credit card needed)
3. Copy the key

### Step 3 — Deploy on Render
1. Push this project to GitHub
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo
4. Set these values:

| Setting | Value |
|---|---|
| **Environment** | Python |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `python bot.py` |

5. Add **Environment Variables**:

| Key | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | your bot token from BotFather |
| `GOOGLE_API_KEY` | your Gemini API key |

6. Click **Create Web Service** → wait for deploy → done!

### Step 4 — Keep it alive (optional but recommended)
Render free-tier web services sleep after ~15 minutes of no traffic.  
To prevent this, add your service URL to [UptimeRobot](https://uptimerobot.com) (free) with a 5-minute ping interval pointing to `https://your-app.onrender.com/health`.

---

## 🛠 Local development

```bash
# Clone / copy files
pip install -r requirements.txt

# Set env vars
export TELEGRAM_BOT_TOKEN="your_token"
export GOOGLE_API_KEY="your_key"

python bot.py
```

---

## 📁 Project structure

```
.
├── bot.py           # Main bot (all logic)
├── requirements.txt
├── runtime.txt      # Python version for Render
├── Procfile         # Start command for Render
└── README.md
```

---

## 🔧 What was fixed (v2 → v3)

- ❌ Removed broken `googletrans` dependency → translation now uses Gemini directly
- ❌ Removed `Pillow` missing from requirements.txt → added
- ❌ Fixed webhook + polling conflict → clean polling-only architecture
- ❌ Fixed broken Flask webhook route (wrong `asyncio.create_task` in sync context)
- ❌ Fixed `googletrans` async usage errors
- ✅ Added signal handling for graceful Render shutdown (SIGTERM)
- ✅ Added 5 new commands: `/code`, `/imagine`, `/history`, `/translate` improved, `/lang`
- ✅ Added sticker & voice message handling
- ✅ Added Hindi language support
- ✅ Long message splitting (> 4000 chars)
- ✅ Better error handling & logging
- ✅ Flask health server keeps Render service alive
