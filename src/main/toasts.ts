// Transient toasts (Flow bar / hub) with action callbacks, plus persisted notification-center items.
import { randomUUID } from 'node:crypto';
import type { AppNotification, Toast } from '@shared/types';
import { broadcast } from './ipc';
import { getCtx } from './context';
import { newId, nowIso } from './db';

type ActionHandler = (actionId: string) => void;
const handlers = new Map<string, ActionHandler>();

export function showToast(t: Omit<Toast, 'id'>, onAction?: ActionHandler): string {
  const id = randomUUID();
  if (onAction) handlers.set(id, onAction);
  broadcast('toast:show', { ...t, id });
  return id;
}

export function hideToast(id: string): void {
  handlers.delete(id);
  broadcast('toast:hide', { id });
}

export function runToastAction(id: string, actionId: string): void {
  const h = handlers.get(id);
  hideToast(id);
  h?.(actionId);
}

/**
 * Show a one-time / rate-limited education toast keyed by notification type.
 * `max` caps lifetime shows; `minIntervalMs` spaces repeats.
 */
export function showNudge(key: string, t: Omit<Toast, 'id' | 'key'>, opts: { max?: number; minIntervalMs?: number } = {}, onAction?: ActionHandler): boolean {
  const { settings } = getCtx();
  const s = settings.get();
  if (!s.notifications.suggestions) return false;
  const n = s.nudges[key] ?? { lastShown: 0, count: 0 };
  if (opts.max !== undefined && n.count >= opts.max) return false;
  if (opts.minIntervalMs !== undefined && Date.now() - n.lastShown < opts.minIntervalMs) return false;
  settings.set('nudges', { ...s.nudges, [key]: { lastShown: Date.now(), count: n.count + 1 } });
  showToast({ ...t, key }, onAction);
  return true;
}

/** Persist an item in the notification center (bell). */
export function addNotification(n: Pick<AppNotification, 'type' | 'key' | 'title' | 'text'>): void {
  const s = getCtx().settings.get().notifications;
  if (n.type === 'tip' && !s.suggestions) return;
  if (n.type === 'announcement' && !s.announcements) return;
  if (n.type === 'milestone' && !s.milestones) return;
  getCtx().db.insert('notifications', { id: newId(), ...n, isRead: 0, isArchived: 0, createdAt: nowIso() });
  broadcast('notifications:changed', null);
}
