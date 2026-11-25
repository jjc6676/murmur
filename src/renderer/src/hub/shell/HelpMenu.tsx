import { useState, type ReactNode } from 'react';
import { BookOpen, Command, Languages, LifeBuoy, Megaphone, Mic, Newspaper } from 'lucide-react';
import { Dialog, Menu } from '../../ui';
import { toast, useHubUi } from '../state';

export function HelpMenu({ trigger }: { trigger: (p: { onClick: (e: React.MouseEvent) => void; 'aria-expanded': boolean }) => ReactNode }) {
  const openSettings = useHubUi((state) => state.openSettings);
  const [changelog, setChangelog] = useState(false);
  const offline = () => toast('Murmur runs fully offline', { body: 'Online support is unavailable. Your data never leaves this device.', tone: 'info' });
  return (
    <>
      <Menu
        trigger={trigger}
        align="start"
        items={[
          { label: <strong>Essentials</strong>, disabled: true },
          { label: 'Shortcuts', icon: <Command size={16} />, onSelect: () => openSettings('shortcuts') },
          { label: 'Microphone', icon: <Mic size={16} />, onSelect: () => openSettings('general') },
          { label: 'Languages', icon: <Languages size={16} />, onSelect: () => openSettings('general') },
          { separator: true, label: '' },
          { label: 'What’s New', icon: <Newspaper size={16} />, onSelect: () => setChangelog(true) },
          { separator: true, label: '' },
          { label: 'Help Center', icon: <BookOpen size={16} />, onSelect: offline },
          { label: 'Talk to support', icon: <LifeBuoy size={16} />, onSelect: offline },
          { label: 'Contact sales', icon: <Megaphone size={16} />, onSelect: offline },
        ]}
      />
      <Dialog open={changelog} onClose={() => setChangelog(false)} title="What’s New">
        <h3>Murmur is yours</h3>
        <p>Dictation, Notetaker, Insights, Skills, and Memory now work locally on your Windows PC.</p>
        <p>Your recordings, transcripts, and writing profile remain on this device.</p>
      </Dialog>
    </>
  );
}
