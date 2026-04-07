import type { CommandContext, Context } from 'grammy';
import { banUser, getAllUsers, getTopUsers } from '../db';
import { config } from '../config';
import { logger } from '../utils/logger';
import { splitMessage } from '../utils/split';

function isAdmin(ctx: CommandContext<Context>): boolean {
  return config.adminIds.includes(ctx.from?.id ?? 0);
}

// ─── /ban <userId> ────────────────────────────────────────────────────────────
export async function handleBan(ctx: CommandContext<Context>) {
  if (!isAdmin(ctx)) return;
  const parts = ctx.message?.text?.split(' ');
  const targetId = parseInt(parts?.[1] ?? '');
  if (!targetId) return ctx.reply('Usage: /ban <user_telegram_id>');

  await banUser(targetId, true);
  await ctx.reply(`✅ User ${targetId} has been banned.`);
  logger.info(`Admin ${ctx.from!.id} banned user ${targetId}`);

  // Notify the banned user
  try {
    await ctx.api.sendMessage(targetId, '🚫 You have been banned from using this bot.');
  } catch {}
}

// ─── /unban <userId> ──────────────────────────────────────────────────────────
export async function handleUnban(ctx: CommandContext<Context>) {
  if (!isAdmin(ctx)) return;
  const parts = ctx.message?.text?.split(' ');
  const targetId = parseInt(parts?.[1] ?? '');
  if (!targetId) return ctx.reply('Usage: /unban <user_telegram_id>');

  await banUser(targetId, false);
  await ctx.reply(`✅ User ${targetId} has been unbanned.`);
  logger.info(`Admin ${ctx.from!.id} unbanned user ${targetId}`);
}

// ─── /broadcast <message> ─────────────────────────────────────────────────────
export async function handleBroadcast(ctx: CommandContext<Context>) {
  if (!isAdmin(ctx)) return;
  const text = ctx.message?.text?.slice('/broadcast'.length).trim();
  if (!text) return ctx.reply('Usage: /broadcast <message>');

  const allUsers = await getAllUsers();
  let sent = 0;
  let failed = 0;

  await ctx.reply(`📡 Broadcasting to ${allUsers.length} users...`);

  for (const user of allUsers) {
    if (user.isBanned) continue;
    try {
      await ctx.api.sendMessage(user.telegramId, `📢 *Announcement*\n\n${text}`, {
        parse_mode: 'Markdown',
      });
      sent++;
      // Small delay to avoid Telegram flood limits
      await sleep(50);
    } catch {
      failed++;
    }
  }

  await ctx.reply(`✅ Broadcast done!\n📨 Sent: ${sent}\n❌ Failed: ${failed}`);
}

// ─── /users ───────────────────────────────────────────────────────────────────
export async function handleUsers(ctx: CommandContext<Context>) {
  if (!isAdmin(ctx)) return;
  const allUsers = await getAllUsers();
  const banned = allUsers.filter((u) => u.isBanned).length;
  const text =
    `👥 *User Summary*\n\n` +
    `Total: ${allUsers.length}\n` +
    `Banned: ${banned}\n` +
    `Active: ${allUsers.length - banned}`;
  await ctx.reply(text, { parse_mode: 'Markdown' });
}

// ─── /topusers ────────────────────────────────────────────────────────────────
export async function handleTopUsers(ctx: CommandContext<Context>) {
  if (!isAdmin(ctx)) return;
  const top = await getTopUsers(10);
  if (!top.length) return ctx.reply('No users yet.');

  const lines = top.map(
    (u, i) =>
      `${i + 1}. ${u.firstName}${u.username ? ` (@${u.username})` : ''} — ${u.totalCount} msgs`,
  );

  await ctx.reply(`🏆 *Top Users*\n\n${lines.join('\n')}`, {
    parse_mode: 'Markdown',
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
