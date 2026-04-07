import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, lt } from 'drizzle-orm';
import { config } from '../config';
import { users, chatHistory, groups, type User } from './schema';
import { logger } from '../utils/logger';

const client = postgres(config.databaseUrl, { max: 10, idle_timeout: 30 });
export const db = drizzle(client);

// ─── Init Tables ─────────────────────────────────────────────────────────────
export async function initDB(): Promise<void> {
  await client`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username VARCHAR(255),
      first_name VARCHAR(255) NOT NULL DEFAULT 'User',
      is_banned BOOLEAN NOT NULL DEFAULT FALSE,
      mode VARCHAR(50) NOT NULL DEFAULT 'chat',
      daily_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      last_reset TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await client`
    CREATE TABLE IF NOT EXISTS chat_history (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      chat_id BIGINT NOT NULL,
      role VARCHAR(10) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await client`
    CREATE INDEX IF NOT EXISTS users_telegram_idx ON users(telegram_id)
  `;
  await client`
    CREATE INDEX IF NOT EXISTS history_idx ON chat_history(telegram_id, chat_id)
  `;
  await client`
    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL DEFAULT 'Unknown Group',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  logger.info('Database tables ready');
}

// ─── User Helpers ─────────────────────────────────────────────────────────────
export async function getOrCreateUser(
  telegramId: number,
  firstName: string,
  username?: string,
): Promise<User> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);

  if (existing[0]) {
    // Update name/username if changed
    if (existing[0].firstName !== firstName || existing[0].username !== username) {
      await db
        .update(users)
        .set({ firstName, username: username ?? null })
        .where(eq(users.telegramId, telegramId));
    }
    return { ...existing[0], firstName, username: username ?? null };
  }

  const [newUser] = await db
    .insert(users)
    .values({ telegramId, firstName, username: username ?? null })
    .returning();
  return newUser;
}

export async function getUser(telegramId: number): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateUserMode(telegramId: number, mode: string): Promise<void> {
  await db.update(users).set({ mode }).where(eq(users.telegramId, telegramId));
}

export async function incrementUserCount(telegramId: number): Promise<void> {
  await client`
    UPDATE users
    SET daily_count = daily_count + 1, total_count = total_count + 1
    WHERE telegram_id = ${telegramId}
  `;
}

export async function resetDailyCountsIfNeeded(telegramId: number): Promise<void> {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  await client`
    UPDATE users
    SET daily_count = 0, last_reset = NOW()
    WHERE telegram_id = ${telegramId}
      AND last_reset < ${midnight}
  `;
}

export async function banUser(telegramId: number, ban: boolean): Promise<void> {
  await db
    .update(users)
    .set({ isBanned: ban })
    .where(eq(users.telegramId, telegramId));
}

export async function getAllUsers(): Promise<User[]> {
  return db.select().from(users);
}

export async function getTopUsers(limit = 10): Promise<User[]> {
  return db
    .select()
    .from(users)
    .orderBy(desc(users.totalCount))
    .limit(limit);
}

// ─── History Helpers ──────────────────────────────────────────────────────────
export async function getHistory(
  telegramId: number,
  chatId: number,
  limit: number,
) {
  return db
    .select()
    .from(chatHistory)
    .where(
      and(
        eq(chatHistory.telegramId, telegramId),
        eq(chatHistory.chatId, chatId),
      ),
    )
    .orderBy(desc(chatHistory.createdAt))
    .limit(limit);
}

export async function addHistory(
  telegramId: number,
  chatId: number,
  role: 'user' | 'model',
  content: string,
): Promise<void> {
  await db.insert(chatHistory).values({ telegramId, chatId, role, content });

  // Prune — keep only latest 40 rows per user+chat
  await client`
    DELETE FROM chat_history
    WHERE id IN (
      SELECT id FROM chat_history
      WHERE telegram_id = ${telegramId} AND chat_id = ${chatId}
      ORDER BY created_at DESC
      OFFSET 40
    )
  `;
}

export async function clearHistory(telegramId: number, chatId: number): Promise<void> {
  await db
    .delete(chatHistory)
    .where(
      and(
        eq(chatHistory.telegramId, telegramId),
        eq(chatHistory.chatId, chatId),
      ),
    );
}

// ─── Group Helpers ────────────────────────────────────────────────────────────
export async function upsertGroup(chatId: number, title: string): Promise<void> {
  await client`
    INSERT INTO groups (chat_id, title)
    VALUES (${chatId}, ${title})
    ON CONFLICT (chat_id) DO UPDATE SET title = ${title}, is_active = TRUE
  `;
}
