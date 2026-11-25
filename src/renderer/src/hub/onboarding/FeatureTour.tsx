import { useState } from 'react';
import { FileText, Keyboard, Mic, Sparkles } from 'lucide-react';
import { Button, Dialog, Kbd } from '../../ui';
import { useSettings } from '../../lib/settings';
import styles from './FeatureTour.module.css';

const SLIDES = [
  { icon: Mic, title: 'Dictate anywhere', body: 'Hold your shortcut, speak naturally, then release. Murmur pastes polished text into the focused app.' },
  { icon: FileText, title: 'Never miss a meeting detail', body: 'Notetaker captures a local transcript, summary, and action items while you stay present.' },
  { icon: Sparkles, title: 'Make every message sound right', body: 'Per-context styles format work messages, emails, personal chats, and notes differently.' },
] as const;

export function FeatureTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const Icon = slide.icon;
  return <Dialog open={open} onClose={onClose} width={620} ariaLabel="Murmur feature tour">
    <div className={styles.tour}><div className={styles.art}><Icon size={48}/></div><div className={styles.copy}><span>{index + 1} OF {SLIDES.length}</span><h2>{slide.title}</h2><p>{slide.body}</p>{index === 0 && <div className={styles.shortcut}><Keyboard size={17}/> Hold <Kbd combo={settings.shortcuts.ptt[0] ?? 'your shortcut'}/> and speak</div>}<div className={styles.dots}>{SLIDES.map((item, i) => <i key={item.title} className={i === index ? styles.active : ''}/>)}</div><div className={styles.actions}>{index > 0 && <Button variant="ghost" onClick={() => setIndex((i) => i - 1)}>Back</Button>}<Button onClick={() => { if (index === SLIDES.length - 1) { setIndex(0); onClose(); } else setIndex((i) => i + 1); }}>{index === SLIDES.length - 1 ? 'Finish' : 'Next'}</Button></div></div></div>
  </Dialog>;
}
