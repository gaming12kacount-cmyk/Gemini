import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config';
import { logger } from './utils/logger';

// Handlers
import { handleMessage } from './handlers/message';
import { handleCallback } from './handlers/callback';
import {
  handleStart,
  handleHelp,
  handleReset,
  handleMode,
  handleStats,
  handlePing,
  handleAbout,
  handleForget,
} from './handlers/commands';
import {
  handleBan,
  handleUnban,
  handleBroadcast,
  handleUsers,
  handleTopUsers,
} from './handlers/admin';

export function createBot(): Bot {
  const bot = new Bot(config.botToken);

  // ─── Commands ───────────────────────────────────────────────────────────
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('reset', handleReset);
  bot.command('mode', handleMode);
  bot.command('stats', handleStats);
  bot.command('ping', handlePing);
  bot.command('about', handleAbout);
  bot.command('forget', handleForget);
  bot.command('ask', handleMessage);

  // ─── Admin Commands ─────────────────────────────────────────────────────
  bot.command('ban', handleBan);
  bot.command('unban', handleUnban);
  bot.command('broadcast', handleBroadcast);
  bot.command('users', handleUsers);
  bot.command('topusers', handleTopUsers);

  // ─── Messages ───────────────────────────────────────────────────────────
  bot.on('message:text', handleMessage);
  bot.on('message:photo', handleMessage);
  bot.on(['message:document'], handleMessage);

  // ─── Callback Queries ───────────────────────────────────────────────────
  bot.on('callback_query:data', handleCallback);

  // ─── Error Handler ──────────────────────────────────────────────────────
  bot.catch((err) => {
    logger.error(`Bot error: ${err.message}`, err);
  });

  return bot;
}

// ─── Set bot commands menu (call once at startup) ────────────────────────────
export async function setBotCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show all commands' },
    { command: 'ask', description: 'Ask Gemini a question' },
    { command: 'mode', description: 'Switch AI mode (chat/code/tutor/creative...)' },
    { command: 'reset', description: 'Clear conversation memory' },
    { command: 'forget', description: 'Remove last 5 messages from memory' },
    { command: 'stats', description: 'Show your usage stats' },
    { command: 'ping', description: 'Check bot latency' },
    { command: 'about', description: 'About this bot' },
  ]);
  logger.info('Bot commands menu updated');
}
