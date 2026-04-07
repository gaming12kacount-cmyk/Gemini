import {
  pgTable,
  serial,
  bigint,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    telegramId: bigint('telegram_id', { mode: 'number' }).unique().notNull(),
    username: varchar('username', { length: 255 }),
    firstName: varchar('first_name', { length: 255 }).notNull().default('User'),
    isBanned: boolean('is_banned').notNull().default(false),
    mode: varchar('mode', { length: 50 }).notNull().default('chat'),
    dailyCount: integer('daily_count').notNull().default(0),
    totalCount: integer('total_count').notNull().default(0),
    lastReset: timestamp('last_reset').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('users_telegram_idx').on(t.telegramId)],
);

// ─── Chat History ─────────────────────────────────────────────────────────────
export const chatHistory = pgTable(
  'chat_history',
  {
    id: serial('id').primaryKey(),
    telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),
    chatId: bigint('chat_id', { mode: 'number' }).notNull(),
    role: varchar('role', { length: 10 }).notNull(), // 'user' | 'model'
    content: text('content').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('history_idx').on(t.telegramId, t.chatId)],
);

// ─── Groups ───────────────────────────────────────────────────────────────────
export const groups = pgTable('groups', {
  id: serial('id').primaryKey(),
  chatId: bigint('chat_id', { mode: 'number' }).unique().notNull(),
  title: varchar('title', { length: 255 }).notNull().default('Unknown Group'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ChatHistory = typeof chatHistory.$inferSelect;
export type Group = typeof groups.$inferSelect;
