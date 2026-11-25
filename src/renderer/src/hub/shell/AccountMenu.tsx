import type { ReactNode } from 'react';
import { Download, MonitorCog, Settings, SunMoon, UserRound } from 'lucide-react';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { Menu } from '../../ui';
import { toast, useHubUi } from '../state';

export function AccountMenu({ trigger }: { trigger: (p: { onClick: (e: React.MouseEvent) => void; 'aria-expanded': boolean }) => ReactNode }) {
  const settings = useSettings();
  const patch = usePatchSettings();
  const openSettings = useHubUi((state) => state.openSettings);
  const name = [settings.profile.firstName, settings.profile.lastName].filter(Boolean).join(' ') || 'Murmur user';
  const offline = () => toast('Murmur runs fully offline', { body: 'This cloud feature is not available in the offline edition.', tone: 'info' });
  return (
    <Menu
      trigger={trigger}
      align="start"
      items={[
        { label: <strong>{name}</strong>, icon: <UserRound size={16} />, disabled: true },
        { label: settings.profile.email || 'Your local account', disabled: true },
        { label: 'You are on Murmur — free and offline forever', disabled: true },
        { separator: true, label: '' },
        { label: 'Manage account', icon: <Settings size={16} />, onSelect: () => openSettings('account') },
        { label: 'Download Murmur for mobile', icon: <Download size={16} />, onSelect: offline },
        { separator: true, label: '' },
        { label: 'Theme · Light', icon: <SunMoon size={16} />, onSelect: () => void patch({ theme: 'light' }) },
        { label: 'Theme · Dark', icon: <SunMoon size={16} />, onSelect: () => void patch({ theme: 'dark' }) },
        { label: 'Theme · System', icon: <MonitorCog size={16} />, onSelect: () => void patch({ theme: 'system' }) },
      ]}
    />
  );
}
