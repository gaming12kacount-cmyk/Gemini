import * as dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  botToken: required('BOT_TOKEN'),
  geminiApiKey: required('GEMINI_API_KEY'),
  databaseUrl: required('DATABASE_URL'),
  webhookUrl: process.env.WEBHOOK_URL?.replace(/\/$/, '') || '',
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => parseInt(s.trim()))
    .filter(Boolean),
  port: parseInt(process.env.PORT || '3000'),
  dailyLimit: parseInt(process.env.DAILY_LIMIT || '50'),
  cooldownMs: parseInt(process.env.COOLDOWN_SECONDS || '3') * 1000,
  maxMemory: parseInt(process.env.MAX_MEMORY || '20'),
  isProduction: process.env.NODE_ENV === 'production',
  botUsername: '', // filled at runtime after bot.init()
};
