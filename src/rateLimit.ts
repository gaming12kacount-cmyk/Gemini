import { config } from '../config';

// userId -> last request timestamp
const cooldowns = new Map<number, number>();

// userId -> promise chain (queue)
const queues = new Map<number, Promise<void>>();

export function isOnCooldown(userId: number): boolean {
  const last = cooldowns.get(userId);
  if (!last) return false;
  return Date.now() - last < config.cooldownMs;
}

export function setCooldown(userId: number): void {
  cooldowns.set(userId, Date.now());
}

export function getCooldownRemaining(userId: number): number {
  const last = cooldowns.get(userId);
  if (!last) return 0;
  return Math.ceil((config.cooldownMs - (Date.now() - last)) / 1000);
}

/**
 * Enqueues a task per user so concurrent messages are processed sequentially.
 */
export function enqueue(userId: number, task: () => Promise<void>): Promise<void> {
  const prev = queues.get(userId) ?? Promise.resolve();
  const next = prev.then(task).catch(() => {});
  queues.set(userId, next);
  // Cleanup stale references
  next.finally(() => {
    if (queues.get(userId) === next) queues.delete(userId);
  });
  return next;
}
