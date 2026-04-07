import type { CommandContext, Context } from 'grammy';
import {
  getOrCreateUser,
  getUser,
  clearHistory,
  updateUserMode,
  getAllUsers,
  getTopUsers,
} from '../db';
import { MODES } from '../services/gemini';
import { splitMessage } from '../utils/split';
import { config } from '../config';
import { InlineKeyboard } from 'grammy';

// ─── /start ───────────────────────────────────────────────────────────────────
export async function handleStart(ctx: CommandContext<Context>) {
  const from = ctx.from!;
  await getOrCreateUser(from.id, from.first_name, from.username);

  const kb = new InlineKeyboard()
    .text('💬 Change Mode', 'mode_menu')
    .text('📊 My Stats', 'my_stats')
    .row()
    .text('❓ Help', 'show_help')
    .text('🔄 Reset Chat', 'reset_confirm');

  await ctx.reply(
    `🤖 *Welcome to Gemini AI Bot!*\n\n` +
    `I'm powered by Google's Gemini 1.5 Flash. Here's what I can do:\n\n` +
    `💬 *Chat* — Ask me anything\n` +
    `👨‍💻 *Code* — Debug & write code\n` +
    `📚 *Tutor* — Learn complex topics\n` +
    `✍️ *Creative* — Write stories & poems\n` +
    `🌍 *Translate* — Any language including Bangla\n` +
    `📸 *Vision* — Send photos for analysis\n\n` +
    `Use /help for all commands.`,
    { parse_mode: 'Markdown', reply_markup: kb },
  );
}

// ─── /help ────────────────────────────────────────────────────────────────────
export async function handleHelp(ctx: CommandContext<Context>) {
  const isAdmin = config.adminIds.includes(ctx.from?.id ?? 0);

  const text =
    `📖 *Commands*\n\n` +
    `*Chat*\n` +
    `/ask <question> — Ask a question\n` +
    `/reset — Clear conversation memory\n` +
    `/mode — Switch AI mode\n` +
    `/forget — Remove last 5 messages\n\n` +
    `*Info*\n` +
    `/stats — Your usage stats\n` +
    `/about — About this bot\n` +
    `/ping — Check bot latency\n` +
    `/help — Show this message\n\n` +
    `*In Groups*\n` +
    `• Mention @${config.botUsername} to ask\n` +
    `• Reply to any bot message\n` +
    `• Use /ask in groups\n\n` +
    (isAdmin
      ? `*Admin*\n/ban <id> — Ban user\n/unban <id> — Unban user\n/broadcast <msg> — Message all\n/users — User list\n/topusers — Top users\n`
      : '');

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

// ─── /reset ───────────────────────────────────────────────────────────────────
export async function handleReset(ctx: CommandContext<Context>) {
  const userId = ctx.from!.id;
  const chatId = ctx.chat!.id;
  await clearHistory(userId, chatId);
  await ctx.reply('🗑️ Conversation memory cleared! Starting fresh.');
}

// ─── /mode ────────────────────────────────────────────────────────────────────
export async function handleMode(ctx: CommandContext<Context>) {
  const kb = buildModeKeyboard();
  const user = await getUser(ctx.from!.id);
  const current = user?.mode ?? 'chat';
  const m = MODES[current];

  await ctx.reply(
    `*Current mode:* ${m.emoji} ${m.label}\n\nChoose a mode:`,
    { parse_mode: 'Markdown', reply_markup: kb },
  );
}

export function buildModeKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  const entries = Object.entries(MODES);
  for (let i = 0; i < entries.length; i += 2) {
    const [key1, v1] = entries[i];
    const [key2, v2] = entries[i + 1] ?? [];
    if (key2) {
      kb.text(`${v1.emoji} ${v1.label}`, `set_mode:${key1}`)
        .text(`${v2.emoji} ${v2.label}`, `set_mode:${key2}`)
        .row();
    } else {
      kb.text(`${v1.emoji} ${v1.label}`, `set_mode:${key1}`).row();
    }
  }
  return kb;
}

// ─── /stats ───────────────────────────────────────────────────────────────────
export async function handleStats(ctx: CommandContext<Context>) {
  const user = await getUser(ctx.from!.id);
  if (!user) return ctx.reply('No data found. Send a message first!');

  const m = MODES[user.mode] ?? MODES.chat;
  await ctx.reply(
    `📊 *Your Stats*\n\n` +
    `👤 Name: ${user.firstName}\n` +
    `🔖 Mode: ${m.emoji} ${m.label}\n` +
    `📨 Today: ${user.dailyCount} / ${config.dailyLimit}\n` +
    `📬 All time: ${user.totalCount}\n` +
    `🗓️ Member since: ${user.createdAt.toDateString()}`,
    { parse_mode: 'Markdown' },
  );
}

// ─── /ping ────────────────────────────────────────────────────────────────────
export async function handlePing(ctx: CommandContext<Context>) {
  const start = Date.now();
  const msg = await ctx.reply('🏓 Pinging...');
  const latency = Date.now() - start;
  await ctx.api.editMessageText(
    ctx.chat!.id,
    msg.message_id,
    `🏓 Pong! Latency: *${latency}ms*`,
    { parse_mode: 'Markdown' },
  );
}

// ─── /about ───────────────────────────────────────────────────────────────────
export async function handleAbout(ctx: CommandContext<Context>) {
  await ctx.reply(
    `🤖 *Gemini AI Bot*\n\n` +
    `Powered by Google Gemini 1.5 Flash\n` +
    `Built with Node.js + Grammy + Drizzle ORM\n\n` +
    `Features:\n` +
    `• Multi-mode AI (Chat, Code, Tutor, Creative, Translate)\n` +
    `• Vision — analyze images\n` +
    `• Per-user conversation memory\n` +
    `• Works in groups & private chats\n` +
    `• Rate limiting & daily quotas`,
    { parse_mode: 'Markdown' },
  );
}

// ─── /forget (remove last 5 messages) ────────────────────────────────────────
export async function handleForget(ctx: CommandContext<Context>) {
  const { default: db_module } = await import('../db');
  // Using raw import to access chatHistory table
  const { db } = await import('../db');
  const { chatHistory } = await import('../db/schema');
  const { eq, and, desc } = await import('drizzle-orm');

  const userId = ctx.from!.id;
  const chatId = ctx.chat!.id;

  // Get last 5 ids
  const rows = await db
    .select({ id: chatHistory.id })
    .from(chatHistory)
    .where(and(eq(chatHistory.telegramId, userId), eq(chatHistory.chatId, chatId)))
    .orderBy(desc(chatHistory.createdAt))
    .limit(5);

  if (rows.length === 0) return ctx.reply('Nothing to forget!');

  const ids = rows.map((r) => r.id);
  const { inArray } = await import('drizzle-orm');
  await db.delete(chatHistory).where(inArray(chatHistory.id, ids));

  await ctx.reply(`🗑️ Removed last ${ids.length} message(s) from memory.`);
}
