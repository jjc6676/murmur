import { useState } from 'react';
import { Check, Globe2, Plus, X } from 'lucide-react';
import type { CleanupLevel, StyleContext, StyleTone } from '@shared/types';
import { applyTone, capitalize, ensureTerminalPunctuation } from '@shared/textPipeline';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { Badge, Banner, Button, Dialog, Input, Page, PageHeader, Tabs, TextArea, Toggle } from '../../ui';
import styles from './style.module.css';

type Tab = StyleContext | 'cleanup';
const CONTEXTS: { id: StyleContext; label: string; sample: string }[] = [
  { id: 'personal', label: 'Personal messages', sample: 'Had such a good time tonight. See you soon' },
  { id: 'work', label: 'Work messages', sample: 'Hey team, the launch is looking good. I will share the final update tomorrow' },
  { id: 'email', label: 'Email', sample: 'Hi Alex, thanks for the thoughtful notes. I will review everything this afternoon' },
  { id: 'other', label: 'Other', sample: 'Here are the next steps for the project' },
];
const TONES: { id: StyleTone; label: string; caption: string }[] = [
  { id: 'formal', label: 'Formal', caption: 'Caps + Punctuation' }, { id: 'casual', label: 'Casual', caption: 'Caps + Less punctuation' },
  { id: 'very_casual', label: 'Very casual', caption: 'No Caps + Less punctuation' }, { id: 'excited', label: 'Excited', caption: 'More exclamations' },
];
const CLEANUPS: { id: CleanupLevel; title: string; description: string; before: string; after: string }[] = [
  { id: 'none', title: 'None', description: 'Transcribes exactly what you said, including mistakes.', before: 'um I I think we should go', after: 'um I I think we should go' },
  { id: 'light', title: 'Light', description: 'Removes filler words and fixes grammar.', before: 'um I I think we should go', after: 'I think we should go.' },
  { id: 'medium', title: 'Medium', description: 'Edits for clarity and conciseness.', before: 'I wanted to reach out in order to ask', after: 'I’m reaching out to ask.' },
  { id: 'high', title: 'High', description: 'Rewrites for brevity and polish.', before: 'The thing I wanted to say is we did really well', after: 'We delivered excellent results.' },
];

export function StyleExperience() {
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>('personal');
  const [wizard, setWizard] = useState(false);
  const tabs = [...CONTEXTS.map((c) => ({ id: c.id as Tab, label: c.label })), { id: 'cleanup' as Tab, label: 'Auto cleanup', badge: <Badge tone="accent">Beta</Badge> }];
  return <Page wide>
    <PageHeader title="Style" />
    <Tabs className={styles.tabs} value={tab} onChange={setTab} tabs={tabs} />
    {!settings.personalizationComplete && <div className={styles.hero}><Banner variant="violet" art={<div className={styles.heroArt} />} title={<>Make Murmur sound like <em>you</em></>} body="Set up different writing styles for different apps." actions={<Button variant="light" onClick={() => setWizard(true)}>Start now</Button>} /></div>}
    {tab === 'cleanup' ? <CleanupPanel /> : <ContextPanel context={tab} />}
    <PersonalizationWizard open={wizard} onClose={() => setWizard(false)} />
  </Page>;
}

function ContextPanel({ context }: { context: StyleContext }) {
  const settings = useSettings();
  const patch = usePatchSettings();
  const current = settings.styles[context];
  const data = CONTEXTS.find((item) => item.id === context)!;
  const [app, setApp] = useState('');
  const tones = context === 'personal' ? [...TONES, { id: 'gen_z' as const, label: 'Gen Z', caption: 'No caps + slang' }] : TONES;
  const preview = (tone: StyleTone) => applyTone(ensureTerminalPunctuation(capitalize(data.sample)), tone);
  async function setTone(tone: StyleTone) { await patch({ styles: { [context]: { tone } } }); }
  async function setApps(apps: string[]) { await patch({ styles: { [context]: { apps } } }); }
  async function addApp() {
    const clean = app.trim().toLowerCase();
    if (!clean || current.apps.includes(clean)) return;
    await setApps([...current.apps, clean]); setApp('');
  }
  return <section>
    <h2 className={styles.sectionHead}>How should your {data.label.toLowerCase()} sound?</h2>
    <p className={styles.subtle}>Murmur applies this style automatically in the apps below.</p>
    <div className={styles.toneGrid}>{tones.map((tone) => <button key={tone.id} className={`${styles.toneCard} ${current.tone === tone.id ? styles.selected : ''}`} onClick={() => void setTone(tone.id)}>
      <div className={styles.toneTop}><span>{tone.label}</span>{current.tone === tone.id && <Check size={17} />}</div><small>{tone.caption}</small><FakeFrame text={preview(tone.id)} />
    </button>)}</div>
    <div className={styles.apps}><div className={styles.appsHeader}><div><strong>Applies in</strong><div className={styles.subtle}>Add process names or websites where this style should be used.</div></div><Plus size={18} /></div>
      <div className={styles.chips}>{current.apps.length ? current.apps.map((name) => <span className={styles.chip} key={name}>{name}<button aria-label={`Remove ${name}`} onClick={() => void setApps(current.apps.filter((a) => a !== name))}><X size={13} /></button></span>) : <span className={styles.subtle}>All other apps</span>}</div>
      <div className={styles.addApp}><Input aria-label="Process name" placeholder="e.g. slack" value={app} onChange={(e) => setApp(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addApp()} /><Button variant="outline" onClick={() => void addApp()}>Add app</Button></div>
    </div>
    <div className={styles.apps}>
      <div className={styles.appsHeader}>
        <div><strong>Custom instructions</strong><div className={styles.subtle}>Tell Murmur how to format this context. These instructions are included in the formatting pass.</div></div>
      </div>
      <TextArea
        aria-label={`Custom instructions for ${data.label}`}
        placeholder="For example: Keep messages concise and always end with a clear next step."
        value={current.instructions ?? ''}
        onChange={(event) => void patch({ styles: { [context]: { instructions: event.target.value } } })}
      />
    </div>
    <div className={styles.disclaimer}><Globe2 size={16} /> Style formatting currently applies only in English. More languages are coming.</div>
  </section>;
}

function FakeFrame({ text }: { text: string }) {
  return <div className={styles.previewFrame}><div className={styles.frameTop}><i /><i /><i /></div><div className={styles.message}>{text}</div></div>;
}

function CleanupPanel() {
  const settings = useSettings();
  const patch = usePatchSettings();
  return <section><h2 className={styles.sectionHead}>Automatic cleanup</h2><p className={styles.subtle}>Applied to every dictation across all apps. You can always recover the original with Undo AI edit.</p>
    <div className={styles.cleanupGrid}>{CLEANUPS.map((level) => <label className={`${styles.cleanupCard} ${settings.cleanupLevel === level.id ? styles.selected : ''}`} key={level.id}><input type="radio" name="cleanup" value={level.id} checked={settings.cleanupLevel === level.id} onChange={() => void patch({ cleanupLevel: level.id })} /><div><strong>{level.title}</strong><p>{level.description}</p></div><div className={styles.cleanupExample}><div><b>Before:</b> {level.before}</div><div><b>After:</b> {level.after}</div></div></label>)}</div>
    {(settings.cleanupLevel === 'medium' || settings.cleanupLevel === 'high') && <div className={styles.aiNote}>Medium and High cleanup use your configured AI provider.</div>}
    <div className={styles.smart}><h2 className={styles.sectionHead}>Smart formatting</h2>{([
      ['lists', 'Format spoken lists'], ['backtrack', 'Apply spoken backtracking'], ['emails', 'Format emails'], ['spokenPunctuation', 'Recognize spoken punctuation'],
    ] as const).map(([key, label]) => <div className={styles.smartRow} key={key}><span>{label}</span><Toggle label={label} checked={settings.smartFormatting[key]} onChange={(checked) => void patch({ smartFormatting: { [key]: checked } })} /></div>)}</div>
  </section>;
}

function PersonalizationWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const patch = usePatchSettings();
  const steps: StyleContext[] = ['work', 'email', 'personal', 'other'];
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const context = steps[index];
  const data = CONTEXTS.find((item) => item.id === context)!;
  const tones = context === 'personal' ? [...TONES.filter((t) => t.id !== 'very_casual'), { id: 'very_casual' as const, label: 'Very casual', caption: 'No Caps + Less punctuation' }, { id: 'gen_z' as const, label: 'Gen Z', caption: 'No caps + slang' }] : TONES.filter((t) => t.id !== 'very_casual');
  async function next(tone?: StyleTone) {
    if (tone) await patch({ styles: { [context]: { tone } } });
    if (index === steps.length - 1) { await patch({ personalizationComplete: true }); setDone(true); }
    else setIndex(index + 1);
  }
  function close() { setIndex(0); setDone(false); onClose(); }
  return <Dialog open={open} onClose={close} width={680} title={done ? undefined : "Let's personalize Murmur to you"} description={done ? undefined : `${data.label} · Choose the style that feels most like you.`} footer={done ? <Button onClick={close}>Done</Button> : <div className={styles.wizardFooter}><Button variant="ghost" onClick={() => void next()}>Skip</Button><Button onClick={() => void next(settings.styles[context].tone)}>Continue</Button></div>}>
    {done ? <div className={styles.done}><div className={styles.doneIcon}><Check size={28} /></div><h2>You&apos;re all set!</h2><p>Murmur will adapt your writing style wherever you work.</p></div> : <><div className={styles.wizardProgress}>{steps.map((step, i) => <i key={step} className={i <= index ? styles.done : ''} />)}</div><div className={styles.wizardChoices}>{tones.map((tone) => <button key={tone.id} className={`${styles.wizardChoice} ${settings.styles[context].tone === tone.id ? styles.selected : ''}`} onClick={() => void patch({ styles: { [context]: { tone: tone.id } } })}><strong>{tone.label}</strong><FakeFrame text={applyTone(ensureTerminalPunctuation(capitalize(data.sample)), tone.id)} /></button>)}</div></>}
  </Dialog>;
}
