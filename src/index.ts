import express from 'express';
import { webhookCallback } from 'grammy';
import cron from 'node-cron';
import { config } from './config';
import { initDB } from './db';
import { createBot, setBotCommands } from './bot';
import { logger } from './utils/logger';

async function main() {
  logger.info('Starting Gemini Telegram Bot...');

  // ─── 1. Init DB ─────────────────────────────────────────────────────────
  await initDB();

  // ─── 2. Create bot ──────────────────────────────────────────────────────
  const bot = createBot();

  // ─── 3. Get bot info ────────────────────────────────────────────────────
  const me = await bot.api.getMe();
  config.botUsername = me.username ?? '';
  logger.info(`Bot ready: @${config.botUsername}`);

  // ─── 4. Set command menu ────────────────────────────────────────────────
  await setBotCommands(bot).catch((e) => logger.warn('setMyCommands failed:', e));

  // ─── 5. Express app (health + webhook) ─────────────────────────────────
  const app = express();
  app.use(express.json());

  // Health check for UptimeRobot
  app.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      bot: `@${config.botUsername}`,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
  });

  // ─── 6. Webhook vs Polling ──────────────────────────────────────────────
  if (config.webhookUrl && config.isProduction) {
    // Webhook mode (Render)
    const webhookPath = `/webhook/${config.botToken}`;
    app.post(webhookPath, webhookCallback(bot, 'express'));

    const webhookFullUrl = `${config.webhookUrl}${webhookPath}`;
    await bot.api.setWebhook(webhookFullUrl, {
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    });
    logger.info(`Webhook set: ${webhookFullUrl}`);

    app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port}`);
    });
  } else {
    // Polling mode (local / Termux)
    logger.info('Starting in polling mode...');

    // Delete any existing webhook first
    await bot.api.deleteWebhook({ drop_pending_updates: true });

    app.listen(config.port, () => {
      logger.info(`Health server on port ${config.port}`);
    });

    bot.start({
      allowed_updates: ['message', 'callback_query'],
      onStart: () => logger.info('Bot polling started'),
    });
  }

  // ─── 7. Cron: Reset daily counts at midnight UTC ─────────────────────────
  cron.schedule('0 0 * * *', async () => {
    logger.info('Running midnight daily count reset cron...');
    // Counts are reset lazily per user on next message (resetDailyCountsIfNeeded)
    // This log is just for monitoring purposes
  });

  // ─── 8. Graceful shutdown ────────────────────────────────────────────────
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down...');
    await bot.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
