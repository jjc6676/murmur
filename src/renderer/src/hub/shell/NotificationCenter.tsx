import { useCallback, useEffect, useState } from 'react';
import type { AppNotification } from '@shared/types';
import { Archive, Bell, MoreHorizontal } from 'lucide-react';
import { api, useEvent } from '../../lib/api';
import { usePatchSettings } from '../../lib/settings';
import { Button, Card, Dialog, EmptyState, IconButton, Menu, Segmented } from '../../ui';
import { toast, useHubUi } from '../state';

export function NotificationCenter() {
  const open = useHubUi((state) => state.notificationsOpen);
  const setOpen = useHubUi((state) => state.setNotificationsOpen);
  const patch = usePatchSettings();
  const [filter, setFilter] = useState<'new' | 'archived'>('new');
  const [items, setItems] = useState<AppNotification[]>([]);
  const refresh = useCallback(() => {
    void api.notifications.list(filter === 'archived').then(setItems);
  }, [filter]);
  useEvent('notifications:changed', refresh);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (!open) return;
    void api.notifications.markAllRead().then(() => patch({ lastNotificationReadTime: Date.now() })).then(refresh);
  }, [open, patch, refresh]);
  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      await patch({ lastNotificationReadTime: Date.now() });
      refresh();
    } catch {
      toast('Couldn’t mark notifications as read', { tone: 'error' });
    }
  };
  const archive = async (ids: string[]) => {
    try {
      await api.notifications.archive(ids);
      refresh();
    } catch {
      toast(ids.length > 1 ? 'Couldn’t archive all notifications' : 'Couldn’t archive notification', { tone: 'error' });
    }
  };
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Notifications"
      width={600}
      footer={filter === 'new' && items.length ? <><Button variant="ghost" onClick={() => void markAllRead()}>Mark all as read</Button><Button variant="outline" onClick={() => void archive(items.map((item) => item.id))}>Archive all</Button></> : undefined}
    >
      <Segmented value={filter} onChange={setFilter} options={[{ value: 'new', label: 'New' }, { value: 'archived', label: 'Archived' }]} />
      {items.length ? (
        <div>
          {items.map((item) => (
            <Card padded key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
                <small>{new Date(item.createdAt).toLocaleString()}</small>
              </div>
              {filter === 'new' && (
                <Menu
                  trigger={(props) => <IconButton label="More actions" {...props}><MoreHorizontal size={16} /></IconButton>}
                  items={[{ label: 'Archive', icon: <Archive size={15} />, onSelect: () => void archive([item.id]) }]}
                />
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Bell size={28} />} title={filter === 'archived' ? 'No archived notifications' : 'No notifications yet'} body={filter === 'archived' ? 'Archived notifications will appear here.' : 'You’re all caught up! We’ll ping you when there’s something exciting again.'} />
      )}
    </Dialog>
  );
}
