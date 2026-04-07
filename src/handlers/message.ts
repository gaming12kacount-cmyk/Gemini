import type { Context } from 'grammy';
import axios from 'axios';
import {
  getOrCreateUser,
  getUser,
  getHistory,
  addHistory,
  incrementUserCount,
  resetDailyCountsIfNeeded,
  upsertGroup,
} from '../db';
import { askGemini, analyzeImage, buildHistory } from '../services/gemini';
import { splitMessage } from '../utils/split';
import {
  isOnCooldown,
  setCooldown,
  getCooldownRemaining,
  enqueue,
} from '../utils/rateLimit';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── Entry Point ──────────────────────────────────────────────────────────────
export async function handleMessage(ctx: Context) {
  const from = ctx.from;
  const chat = ctx.chat;
  if (!from || !chat) return;

  const isGroup = chat.type === 'group' || chat.type === 'supergroup';
  const isPrivate = chat.type === 'private';

  // Track group
  if (isGroup) {
    const title = 'title' in chat ? chat.title : 'Group';
    await upsertGroup(chat.id, title).catch(() => {});
  }

  // ─── Determine if we should respond ──────────────────────────────────────
  const text = ctx.message?.text ?? ctx.message?.caption ?? '';
  const hasPhoto = !!ctx.message?.photo;
  const hasDocument =
    !!ctx.message?.document &&
    (ctx.message.document.mime_type?.startsWith('image/') ?? false);

  let prompt = text.trim();

  if (isGroup) {
    const isMentioned =
      prompt.includes(`@${config.botUsername}`) ||
      ctx.message?.reply_to_message?.from?.username === config.botUsername;

    const isAskCommand = prompt.startsWith('/ask');

    if (!isMentioned && !isAskCommand && !hasPhoto) return;

    // Clean mention from prompt
    prompt = prompt
      .replace(new RegExp(`@${config.botUsername}`, 'gi'), '')
      .replace(/^\/ask\s*/i, '')
      .trim();
  } else if (prompt.startsWith('/ask')) {
    prompt = prompt.replace(/^\/ask\s*/i, '').trim();
  }

  if (!prompt && !hasPhoto && !hasDocument) return;

  // ─── User checks ──────────────────────────────────────────────────────────
  const user = await getOrCreateUser(from.id, from.first_name, from.username);

  if (user.isBanned) {
    return ctx.reply('🚫 You are banned from using this bot.');
  }

  // Reset daily count if it's a new day
  await resetDailyCountsIfNeeded(from.id);
  const freshUser = await getUser(from.id);

  if ((freshUser?.dailyCount ?? 0) >= config.dailyLimit) {
    return ctx.reply(
      `⛔ You've reached your daily limit of ${config.dailyLimit} messages.\nResets at midnight UTC.`,
    );
  }

  // Cooldown check
  if (isOnCooldown(from.id)) {
    const secs = getCooldownRemaining(from.id);
    return ctx.reply(`⏳ Please wait ${secs}s before sending another message.`);
  }

  // Queue per user
  enqueue(from.id, () => processMessage(ctx, from.id, chat.id, prompt, hasPhoto || hasDocument, freshUser?.mode ?? 'chat'));
}

// ─── Core processing ──────────────────────────────────────────────────────────
async function processMessage(
  ctx: Context,
  userId: number,
  chatId: number,
  prompt: string,
  hasImage: boolean,
  mode: string,
) {
  // Show typing indicator
  await ctx.replyWithChatAction('typing').catch(() => {});

  setCooldown(userId);

  try {
    let reply: string;

    if (hasImage) {
      reply = await handleImageMessage(ctx, prompt, mode);
    } else {
      // Build history
      const historyRows = await getHistory(userId, chatId, config.maxMemory);
      const history = buildHistory(historyRows.reverse()); // oldest first

      reply = await askGemini(prompt, history, mode);

      // Save to history
      await addHistory(userId, chatId, 'user', prompt);
      await addHistory(userId, chatId, 'model', reply);
    }

    // Increment usage
    await incrementUserCount(userId);

    // Send reply (split if long)
    const chunks = splitMessage(reply);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(async () => {
        // Fallback: send as plain text if markdown fails
        await ctx.reply(chunk).catch(() => {});
      });
    }
  } catch (err) {
    logger.error('processMessage error:', err);
    await ctx.reply('❌ An unexpected error occurred. Please try again.').catch(() => {});
  }
}

// ─── Image handler ────────────────────────────────────────────────────────────
async function handleImageMessage(ctx: Context, prompt: string, mode: string): Promise<string> {
  const photo = ctx.message?.photo;
  const doc = ctx.message?.document;

  let fileId: string;
  let mimeType = 'image/jpeg';

  if (photo && photo.length > 0) {
    fileId = photo[photo.length - 1].file_id; // Largest size
  } else if (doc) {
    fileId = doc.file_id;
    mimeType = doc.mime_type ?? 'image/jpeg';
  } else {
    return '⚠️ No image found in the message.';
  }

  try {
    // Get file path from Telegram
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

    // Download as buffer
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const base64 = Buffer.from(response.data).toString('base64');

    const imagePrompt = prompt || 'Describe this image in detail. What do you see?';
    return await analyzeImage(base64, mimeType, imagePrompt, mode);
  } catch (err) {
    logger.error('Image download error:', err);
    return '❌ Failed to download the image. Please try again.';
  }
}
