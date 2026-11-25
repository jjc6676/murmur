// Notification center (bell) storage + toast action routing.
import type { AppNotification } from '@shared/types';
import { getCtx } from '../context';
import { broadcast, handle } from '../ipc';
import { hideToast, runToastAction } from '../toasts';

interface NotificationRow {
  id: string;
  type: AppNotification['type'];
  key: string;
  title: string;
  text: string;
  isRead: number;
  isArchived: number;
  createdAt: string;
}

export function registerNotifications(): void {
  const { db } = getCtx();
  handle('notifications', {
    list: (archived) =>
      db
        .all<NotificationRow>('SELECT * FROM notifications WHERE isArchived = ? ORDER BY createdAt DESC LIMIT 200', archived ? 1 : 0)
        .map((r) => ({ ...r, isRead: !!r.isRead, isArchived: !!r.isArchived })),
    markAllRead() {
      db.run('UPDATE notifications SET isRead = 1');
      broadcast('notifications:changed', null);
    },
    archive(ids) {
      db.tx(() => ids.forEach((id) => db.run('UPDATE notifications SET isArchived = 1, isRead = 1 WHERE id = ?', id)));
      broadcast('notifications:changed', null);
    },
    unreadCount: () => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE isRead = 0 AND isArchived = 0')?.n ?? 0,
    toastAction: (toastId, actionId) => runToastAction(toastId, actionId),
    dismissToast: (toastId) => hideToast(toastId),
  });
}
