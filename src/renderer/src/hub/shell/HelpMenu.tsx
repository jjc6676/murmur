import { useState, type ReactNode } from 'react';
import { BookOpen, Command, Languages, LifeBuoy, Megaphone, Mic, Newspaper } from 'lucide-react';
import { Button, Dialog, Field, Input, Menu, TextArea } from '../../ui';
import { api } from '../../lib/api';
import { toast, useHubUi } from '../state';
import s from './Shell.module.css';

export function HelpMenu({ trigger }: { trigger: (p: { onClick: (e: React.MouseEvent) => void; 'aria-expanded': boolean }) => ReactNode }) {
  const openSettings = useHubUi((state) => state.openSettings);
  const [changelog, setChangelog] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const saveFeedback = async () => {
    const text = `${subject.trim()}\n\n${message.trim()}\n\nAttachments: ${attachments.join(', ') || 'None'}`;
    try {
      await api.notes.create({ title: `Feedback: ${subject.trim() || 'Murmur'}`, content: `<p>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('\n', '<br>')}</p>` });
      toast('Feedback saved locally', { body: 'You can find it in Scratchpad.', tone: 'success' });
    } catch {
      await api.app.copyText(text);
      toast('Feedback copied to clipboard', { body: 'Local saving failed, so your message was copied.', tone: 'info' });
    }
    setFeedback(false);
  };
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
          { label: 'Share Feedback', icon: <Megaphone size={16} />, onSelect: () => setFeedback(true) },
        ]}
      />
      <Dialog open={changelog} onClose={() => setChangelog(false)} title="What’s New">
        <h3>Murmur is yours</h3>
        <p>Dictation, Notetaker, Insights, Skills, and Memory now work locally on your Windows PC.</p>
        <p>Your recordings, transcripts, and writing profile remain on this device.</p>
      </Dialog>
      <Dialog
        open={feedback}
        onClose={() => setFeedback(false)}
        title="Share Feedback"
        description="Saved locally in Scratchpad. Murmur does not upload feedback."
        footer={<><Button variant="ghost" onClick={() => setFeedback(false)}>Cancel</Button><Button disabled={!message.trim()} onClick={() => void saveFeedback()}>Save feedback</Button></>}
      >
        <div className={s.feedbackForm}>
          <Field label="Subject"><Input aria-label="Feedback subject" value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
          <Field label="Message"><TextArea aria-label="Feedback message" rows={7} value={message} onChange={(event) => setMessage(event.target.value)} /></Field>
          <Field label="Attachments" hint="Up to 3 image names are recorded locally; files are not uploaded.">
            <Input type="file" accept="image/*" multiple onChange={(event) => setAttachments(Array.from(event.target.files ?? []).slice(0, 3).map((file) => file.name))} />
          </Field>
          {attachments.map((name) => <Button key={name} variant="ghost" size="sm" onClick={() => setAttachments((current) => current.filter((item) => item !== name))}>Remove {name}</Button>)}
        </div>
      </Dialog>
    </>
  );
}
