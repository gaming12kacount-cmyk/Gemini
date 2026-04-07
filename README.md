# 🤖 Gemini Telegram Bot

A professional, feature-rich Telegram bot powered by **Google Gemini 1.5 Flash**, built with Node.js + TypeScript + Grammy + Drizzle ORM.

---

## ✨ Features

| Category | Features |
|---|---|
| 🤖 AI | Gemini 1.5 Flash, 6 AI modes, image vision, auto-retry, conversation memory |
| 💬 Chat | Private chat, group chat (mention/reply), per-user memory, message queuing |
| 📸 Vision | Send any photo → Gemini describes/analyzes it |
| 🔒 Safety | Rate limiting, daily quotas, cooldown, ban system, spam protection |
| 🛠️ Admin | Ban/unban, broadcast, user stats, top users |
| 🗄️ Database | PostgreSQL + Drizzle ORM (Neon.tech free tier compatible) |
| 🚀 Deploy | Render webhook mode + UptimeRobot health ping |
| 📱 Local | Works in Termux with polling mode |

---

## 🧠 AI Modes

| Mode | Description |
|---|---|
| 💬 Chat | General assistant (default) |
| 👨‍💻 Code | Software engineer — debug, write, explain code |
| 📚 Tutor | Patient teacher — step-by-step explanations |
| ✍️ Creative | Writer — stories, poems, brainstorming |
| 🌍 Translator | Translate anything, including Bengali/Bangla |
| 📊 Analyst | Analytical thinker — pros/cons, comparisons |

Switch anytime with `/mode` command or inline buttons.

---

## 📋 Commands

```
/start      — Welcome message + quick buttons
/help       — All commands
/ask        — Ask a question (also works in groups)
/mode       — Switch AI mode
/reset      — Clear conversation memory
/forget     — Remove last 5 messages from memory
/stats      — Your usage stats
/ping       — Bot latency check
/about      — About this bot
```

**Admin only:**
```
/ban <id>         — Ban a user
/unban <id>       — Unban a user
/broadcast <msg>  — Message all users
/users            — User summary
/topusers         — Top 10 users by message count
```

---

## 🚀 Quick Setup

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/gemini-telegram-bot.git
cd gemini-telegram-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com)
- `DATABASE_URL` — PostgreSQL URL (see below)
- `ADMIN_IDS` — your Telegram user ID (get it from [@userinfobot](https://t.me/userinfobot))

### 3. Get a Free PostgreSQL Database

Use **[Neon.tech](https://neon.tech)** (free tier, no card required):
1. Sign up → Create project → Copy the connection string
2. Paste it as `DATABASE_URL` in your `.env`

### 4. Run Locally (Termux / PC)

```bash
npm run dev
```

The bot auto-creates all database tables on first run. No migration needed.

---

## ☁️ Deploy on Render

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/gemini-telegram-bot.git
git push -u origin main
```

### Step 2 — Create Render Web Service

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Render auto-detects `render.yaml` settings

### Step 3 — Set Environment Variables in Render

In your Render service → **Environment** tab, add:

| Key | Value |
|---|---|
| `BOT_TOKEN` | Your bot token |
| `GEMINI_API_KEY` | Your Gemini API key |
| `DATABASE_URL` | Neon.tech PostgreSQL URL |
| `WEBHOOK_URL` | `https://YOUR-APP-NAME.onrender.com` |
| `ADMIN_IDS` | Your Telegram ID |
| `NODE_ENV` | `production` |

### Step 4 — Set Up UptimeRobot (Keep Alive)

Render free tier sleeps after 15 min of inactivity. Use UptimeRobot to ping it:

1. Go to [uptimerobot.com](https://uptimerobot.com) → Add New Monitor
2. Type: **HTTP(s)**
3. URL: `https://YOUR-APP-NAME.onrender.com/health`
4. Interval: **5 minutes**

---

## 🏃 Termux Setup (Android)

```bash
# Install Node.js
pkg update && pkg install nodejs-lts git

# Clone the project
git clone https://github.com/YOUR_USERNAME/gemini-telegram-bot.git
cd gemini-telegram-bot

# Install deps
npm install

# Create .env
cp .env.example .env
nano .env  # fill in values (leave WEBHOOK_URL empty for polling)

# Run
npm run dev
```

For background running in Termux:
```bash
nohup npm run dev > bot.log 2>&1 &
tail -f bot.log
```

---

## 🗄️ Database

Tables are created automatically at startup using raw SQL (no migration needed):

- `users` — User profiles, modes, daily counts
- `chat_history` — Conversation memory per user per chat
- `groups` — Group tracking

---

## 📁 Project Structure

```
src/
├── index.ts          # Entry point (webhook/polling, Express)
├── bot.ts            # Bot instance + command registration
├── config.ts         # Environment config
├── db/
│   ├── index.ts      # DB connection + all query helpers
│   └── schema.ts     # Drizzle ORM schema
├── services/
│   └── gemini.ts     # Gemini API integration (chat + vision)
├── handlers/
│   ├── message.ts    # Main message handler (text + images)
│   ├── commands.ts   # User commands
│   ├── admin.ts      # Admin commands
│   └── callback.ts   # Inline keyboard callbacks
└── utils/
    ├── logger.ts     # Winston logger
    ├── split.ts      # Telegram 4096 char splitter
    └── rateLimit.ts  # Cooldown + per-user queue
```

---

## ⚙️ Configuration

| Env Var | Default | Description |
|---|---|---|
| `DAILY_LIMIT` | `50` | Max messages per user per day |
| `COOLDOWN_SECONDS` | `3` | Seconds between messages |
| `MAX_MEMORY` | `20` | Messages kept in context |

---

## 📝 License

MIT
