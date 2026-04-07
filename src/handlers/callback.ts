import type { CallbackQueryContext, Context } from 'grammy';
import { getUser, updateUserMode, clearHistory } from '../db';
import { MODES } from '../services/gemini';
import { buildModeKeyboard } from './commands';
import { config } from '../config';

export async function handleCallback(ctx: CallbackQueryContext<Context>) {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  // ─── Mode menu ─────────────────────────────────────────────────────────────
  if (data === 'mode_menu') {
    const kb = buildModeKeyboard();
    const user = await getUser(userId);
    const current = user?.mode ?? 'chat';
    const m = MODES[current] ?? MODES.chat;
    await ctx.editMessageText(
      `*Current mode:* ${m.emoji} ${m.label}\n\nChoose a mode:`,
      { parse_mode: 'Markdown', reply_markup: kb },
    );
    return ctx.answerCallbackQuery();
  }

  // ─── Set mode ──────────────────────────────────────────────────────────────
  if (data.startsWith('set_mode:')) {
    const mode = data.split(':')[1];
    if (!MODES[mode]) return ctx.answerCallbackQuery('Unknown mode');

    await updateUserMode(userId, mode);
    const m = MODES[mode];
    await ctx.answerCallbackQuery(`✅ Mode set to ${m.emoji} ${m.label}`);
    await ctx.editMessageText(
      `✅ Mode changed to *${m.emoji} ${m.label}*\n\n${m.prompt}`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // ─── My stats ──────────────────────────────────────────────────────────────
  if (data === 'my_stats') {
    const user = await getUser(userId);
    if (!user) return ctx.answerCallbackQuery('No data yet!');
    const m = MODES[user.mode] ?? MODES.chat;
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `📊 *Your Stats*\n\n` +
      `👤 Name: ${user.firstName}\n` +
      `🔖 Mode: ${m.emoji} ${m.label}\n` +
      `📨 Today: ${user.dailyCount} / ${config.dailyLimit}\n` +
      `📬 All time: ${user.totalCount}\n` +
      `🗓️ Member since: ${user.createdAt.toDateString()}`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // ─── Show help ─────────────────────────────────────────────────────────────
  if (data === 'show_help') {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `📖 *Commands*\n\n` +
      `/ask <question> — Ask anything\n` +
      `/reset — Clear memory\n` +
      `/mode — Switch AI mode\n` +
      `/forget — Remove last 5 messages\n` +
      `/stats — Your stats\n` +
      `/ping — Check latency\n` +
      `/about — About this bot`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // ─── Reset confirm ─────────────────────────────────────────────────────────
  if (data === 'reset_confirm') {
    const { InlineKeyboard } = await import('grammy');
    const kb = new InlineKeyboard()
      .text('✅ Yes, reset', 'reset_do')
      .text('❌ Cancel', 'reset_cancel');
    await ctx.answerCallbackQuery();
    await ctx.reply('Are you sure you want to clear your conversation history?', {
      reply_markup: kb,
    });
    return;
  }

  if (data === 'reset_do') {
    await clearHistory(userId, ctx.chat!.id);
    await ctx.answerCallbackQuery('✅ Memory cleared!');
    await ctx.editMessageText('🗑️ Conversation memory cleared!');
    return;
  }

  if (data === 'reset_cancel') {
    await ctx.answerCallbackQuery('Cancelled');
    await ctx.deleteMessage().catch(() => {});
    return;
  }

  await ctx.answerCallbackQuery();
}
