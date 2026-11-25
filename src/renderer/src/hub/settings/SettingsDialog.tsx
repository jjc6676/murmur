import { useEffect, useState, type ReactNode } from 'react';
import {
  Bot,
  ChevronLeft,
  Code2,
  CreditCard,
  FlaskConical,
  Link2,
  Mic,
  Puzzle,
  Settings2,
  Shield,
  SlidersHorizontal,
  User,
  Users,
  X,
} from 'lucide-react';
import type { AsrModelInfo, LlmProvider } from '@shared/types';
import { DEFAULT_SETTINGS, type DeepPartial, type Settings, type ShortcutAction } from '@shared/settings';
import { pttPopoConflict, validateCombo } from '@shared/hotkeys';
import { api, useEvent } from '../../lib/api';
import { usePatchSettings, useSettings } from '../../lib/settings';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  Kbd,
  Progress,
  SearchInput,
  Segmented,
  Select,
  SettingGroup,
  SettingRow,
  TextArea,
  Toggle,
} from '../../ui';
import { toast, useHubUi, type SettingsSection } from '../state';
import styles from './SettingsDialog.module.css';

const SETTINGS_NAV: { id: SettingsSection; label: string; icon: typeof Settings2 }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'system', label: 'System', icon: Settings2 },
  { id: 'notetaker', label: 'Notetaker', icon: Mic },
  { id: 'vibe-coding', label: 'Vibe coding', icon: Code2 },
  { id: 'experimental', label: 'Experimental', icon: FlaskConical },
  { id: 'ai', label: 'AI & Speech', icon: Bot },
  { id: 'connectors', label: 'Connectors', icon: Link2 },
  { id: 'mcp', label: 'MCP', icon: Puzzle },
];
const ACCOUNT_NAV: { id: SettingsSection; label: string; icon: typeof Settings2 }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'plans', label: 'Plans and Billing', icon: CreditCard },
  { id: 'data', label: 'Data and Privacy', icon: Shield },
];

const LANGUAGES = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'],
  ['af', 'Afrikaans'], ['ar', 'Arabic'], ['hy', 'Armenian'], ['az', 'Azerbaijani'], ['be', 'Belarusian'], ['bs', 'Bosnian'], ['bg', 'Bulgarian'], ['ca', 'Catalan'], ['hr', 'Croatian'], ['cs', 'Czech'],
  ['da', 'Danish'], ['et', 'Estonian'], ['fi', 'Finnish'], ['gl', 'Galician'], ['el', 'Greek'], ['he', 'Hebrew'], ['hi', 'Hindi'], ['hu', 'Hungarian'], ['is', 'Icelandic'], ['id', 'Indonesian'],
  ['kn', 'Kannada'], ['kk', 'Kazakh'], ['lv', 'Latvian'], ['lt', 'Lithuanian'], ['mk', 'Macedonian'], ['ms', 'Malay'], ['mr', 'Marathi'], ['mi', 'Maori'], ['ne', 'Nepali'], ['no', 'Norwegian'],
  ['fa', 'Persian'], ['pl', 'Polish'], ['ro', 'Romanian'], ['ru', 'Russian'], ['sr', 'Serbian'], ['sk', 'Slovak'], ['sl', 'Slovenian'], ['sw', 'Swahili'], ['sv', 'Swedish'], ['tl', 'Tagalog'],
  ['ta', 'Tamil'], ['th', 'Thai'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['ur', 'Urdu'], ['vi', 'Vietnamese'], ['cy', 'Welsh'], ['sq', 'Albanian'], ['am', 'Amharic'], ['as', 'Assamese'],
  ['ba', 'Bashkir'], ['eu', 'Basque'], ['bn', 'Bengali'], ['br', 'Breton'], ['my', 'Burmese'], ['yue', 'Cantonese'], ['zh-HK', 'Chinese (Hong Kong)'], ['zh-TW', 'Chinese (Traditional)'], ['fo', 'Faroese'], ['ka', 'Georgian'],
  ['gu', 'Gujarati'], ['ht', 'Haitian Creole'], ['ha', 'Hausa'], ['haw', 'Hawaiian'], ['jv', 'Javanese'], ['lo', 'Lao'], ['la', 'Latin'], ['lb', 'Luxembourgish'], ['mg', 'Malagasy'], ['ml', 'Malayalam'],
  ['mt', 'Maltese'], ['mn', 'Mongolian'], ['oc', 'Occitan'], ['pa', 'Punjabi'], ['ps', 'Pashto'], ['sa', 'Sanskrit'], ['sd', 'Sindhi'], ['si', 'Sinhala'], ['so', 'Somali'], ['su', 'Sundanese'],
  ['tg', 'Tajik'], ['tt', 'Tatar'], ['te', 'Telugu'], ['bo', 'Tibetan'], ['tk', 'Turkmen'], ['uz', 'Uzbek'], ['yi', 'Yiddish'], ['yo', 'Yoruba'], ['zu', 'Zulu'],
] as const;

const SHORTCUTS: { action: ShortcutAction; title: string; description: string }[] = [
  { action: 'ptt', title: 'Push to talk', description: 'Hold the shortcut to dictate something short.' },
  { action: 'popo', title: 'Hands-free mode', description: 'Double-tap to start and stop dictation.' },
  { action: 'cancel', title: 'Cancel', description: 'Dismiss an active dictation and notifications.' },
  { action: 'polish', title: 'Transform', description: 'Run Polish or your configured transformation.' },
  { action: 'viewDiff', title: 'Transform view changes', description: 'Open a diff after Transform.' },
  { action: 'command', title: 'Command Mode', description: 'Use selected text with a voice command.' },
  { action: 'instruct', title: 'Instruct Mode', description: 'Draft a reply using screen context.' },
  { action: 'openScratchpad', title: 'Open Scratchpad', description: 'Open the Scratchpad window.' },
  { action: 'startNotetaker', title: 'Start Notetaker', description: 'Join a meeting or start recording.' },
  { action: 'pasteLast', title: 'Paste last transcript', description: 'Paste your previous dictation.' },
  { action: 'copyLast', title: 'Copy last transcript', description: 'Copy your previous dictation.' },
  { action: 'pressEnter', title: 'Press Enter', description: 'Send messages faster.' },
  { action: 'focusMode', title: 'Focus Mode', description: 'Toggle blocking distracting apps and sites.' },
  { action: 'lens', title: 'Ask Murmur', description: 'Ask about selected or visible context.' },
];

function SectionTitle({ children }: { children: ReactNode }) {
  return <h1 className={styles.title}>{children}</h1>;
}

function OfflineNotice() {
  return <p className={styles.offline}>Murmur runs fully offline. This cloud feature is not available.</p>;
}

function GeneralSection({ s, patch }: SectionProps) {
  const setSection = useHubUi((x) => x.openSettings);
  const [micOpen, setMicOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  return (
    <>
      <SectionTitle>General</SectionTitle>
      <SettingGroup>
        <SettingRow title="Shortcuts" description={<>Hold <Kbd combo={s.shortcuts.ptt[0] ?? 'Not set'} /> and speak.</>}>
          <Button variant="outline" size="sm" onClick={() => setSection('shortcuts')}>Change</Button>
        </SettingRow>
        <SettingRow title="Mouse Flow" description="Set up side buttons 4 and 5 for Dictate and Enter.">
          <MouseSetup s={s} patch={patch} />
        </SettingRow>
        <SettingRow title="Microphone" description={s.micDeviceId === 'default' ? 'Auto-detect' : s.micDeviceId}>
          <Button variant="outline" size="sm" onClick={() => setMicOpen(true)}>Change</Button>
        </SettingRow>
        <SettingRow title="My languages" description={s.autoDetectLanguage ? 'Auto-detect' : s.languages.map((code) => LANGUAGES.find(([c]) => c === code)?.[1] ?? code).join(', ')}>
          <Button variant="outline" size="sm" onClick={() => setLanguageOpen(true)}>Change</Button>
        </SettingRow>
        <SettingRow title="App Language" description="Select your preferred Murmur Hub language">
          <Select value={s.appLanguage ?? 'system'} options={[{ value: 'system', label: 'System default' }, { value: 'en', label: 'English' }]} onChange={(v) => void patch({ appLanguage: v === 'system' ? null : v })} />
        </SettingRow>
        <SettingRow title="Theme">
          <Segmented value={s.theme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} onChange={(theme) => void patch({ theme })} />
        </SettingRow>
        <SettingRow title="Zoom" description="Make text and controls bigger or smaller in the Murmur Hub and Notepad.">
          <label className={styles.range}><input aria-label="Zoom" type="range" min={80} max={150} step={10} value={Math.round(s.zoom * 100)} onChange={(e) => void patch({ zoom: Number(e.target.value) / 100 })} /><span>{Math.round(s.zoom * 100)}%</span></label>
        </SettingRow>
      </SettingGroup>
      <MicrophoneDialog open={micOpen} onClose={() => setMicOpen(false)} s={s} patch={patch} />
      <LanguageDialog open={languageOpen} onClose={() => setLanguageOpen(false)} s={s} patch={patch} />
    </>
  );
}

function MouseSetup({ s, patch }: SectionProps) {
  const [open, setOpen] = useState(false);
  const [tested, setTested] = useState(false);
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Set up</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Set up Mouse Flow" description="Map your mouse side buttons. This replaces their usual back and forward behavior." footer={<Button onClick={() => setOpen(false)}>Done</Button>}>
      <SettingRow title="Button 4 — Dictate"><Toggle label="Use button 4 to dictate" checked={s.mouseFlow.dictateButton === 4} onChange={(v) => void patch({ mouseFlow: { ...s.mouseFlow, dictateButton: v ? 4 : null } })} /></SettingRow>
      <SettingRow title="Button 5 — Enter"><Toggle label="Use button 5 for Enter" checked={s.mouseFlow.enterButton === 5} onChange={(v) => void patch({ mouseFlow: { ...s.mouseFlow, enterButton: v ? 5 : null } })} /></SettingRow>
      <Button variant="outline" onClick={() => setTested(true)}>Test side buttons</Button>
      {tested && <p role="status">Ready — press either side button now.</p>}
    </Dialog>
  </>;
}

function MicrophoneDialog({ open, onClose, s, patch }: SectionProps & { open: boolean; onClose: () => void }) {
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!open) return;
    void api.engines.listAudioDevices().then(setDevices);
    let stream: MediaStream | null = null;
    let frame = 0;
    void navigator.mediaDevices.getUserMedia({ audio: true }).then((value) => {
      stream = value;
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      context.createMediaStreamSource(value).connect(analyser);
      const bytes = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(bytes);
        setLevel(Math.min(100, bytes.reduce((a, b) => a + b, 0) / bytes.length));
        frame = requestAnimationFrame(draw);
      };
      draw();
    }).catch(() => setLevel(0));
    return () => { cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, [open]);
  const ranked = devices.length ? devices : [{ deviceId: 'default-mic', label: 'Default microphone' }];
  return <Dialog open={open} onClose={onClose} title="Microphone" description="Notetaker always uses Auto-detect." footer={<Button onClick={onClose}>Done</Button>}>
    <Field label="Input device"><Select value={s.micDeviceId} options={[{ value: 'default', label: 'Auto-detect' }, ...ranked.map((d) => ({ value: d.deviceId, label: d.label || 'Microphone' }))]} onChange={(micDeviceId) => void patch({ micDeviceId })} /></Field>
    <div className={styles.meter} aria-label={`Microphone level ${Math.round(level)} percent`}><span style={{ width: `${level}%` }} /></div>
    <h3>Microphone ranking</h3>
    <p className={styles.muted}>Drag order determines which microphone Auto-detect tries first.</p>
    <ol className={styles.rankList}>{ranked.map((d, index) => <li key={d.deviceId} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', String(index))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
      const from = Number(e.dataTransfer.getData('text/plain'));
      const labels = ranked.map((x) => x.label);
      const [moved] = labels.splice(from, 1);
      labels.splice(index, 0, moved);
      void patch({ micRanking: labels });
    }}>{d.label || 'Microphone'}</li>)}</ol>
    <p className={styles.advisory}>Built-in or wired microphones are recommended. AirPods and Bluetooth headsets can start slowly and produce more errors.</p>
  </Dialog>;
}

function LanguageDialog({ open, onClose, s, patch }: SectionProps & { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(s.languages);
  const [auto, setAuto] = useState(s.autoDetectLanguage);
  const [models, setModels] = useState<{ id: string; multilingual: boolean; installed: boolean }[]>([]);
  useEffect(() => { if (open) { setSelected(s.languages); setAuto(s.autoDetectLanguage); void api.engines.asrModels().then(setModels); } }, [open, s.languages, s.autoDetectLanguage]);
  const filtered = LANGUAGES.filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()));
  const englishOnly = models.find((m) => m.id === s.asr.model)?.multilingual === false;
  return <Dialog open={open} onClose={onClose} width={560} title="My languages" description="Choose every language you speak. At least one language or Auto-detect is required." footer={<Button disabled={!auto && selected.length === 0} onClick={() => { void patch({ languages: selected, autoDetectLanguage: auto }); onClose(); }}>Save and close</Button>}>
    {englishOnly && <div className={styles.notice}>Your installed speech model is English-only. Download a multilingual model in AI &amp; Speech.</div>}
    <Checkbox checked={auto} onChange={setAuto} label="Auto-detect spoken language" />
    <SearchInput value={query} onChange={setQuery} placeholder="Search 99 languages" />
    <div className={styles.languageGrid}>{filtered.map(([code, name]) => <Checkbox key={code} checked={selected.includes(code)} onChange={(v) => setSelected(v ? [...selected, code] : selected.filter((x) => x !== code))} label={name} />)}</div>
  </Dialog>;
}

function ShortcutsSection({ s }: SectionProps) {
  const setSection = useHubUi((x) => x.openSettings);
  const [editing, setEditing] = useState<ShortcutAction | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (action: ShortcutAction, combo: string) => {
    const validation = validateCombo(combo, action, s.shortcuts);
    if (validation) { setError(validation); return; }
    await api.settings.setShortcut(action, [...s.shortcuts[action], combo]);
    setCapturing(false);
    setError(null);
  };
  const beginCapture = (action: ShortcutAction) => {
    setEditing(action); setCapturing(true); setError(null);
    void api.settings.recordShortcut().then((combo) => save(action, combo)).catch(() => undefined);
  };
  return <>
    <button className={styles.back} onClick={() => setSection('general')}><ChevronLeft size={16} /> General</button>
    <SectionTitle>Shortcuts</SectionTitle>
    {pttPopoConflict(s.shortcuts.ptt, s.shortcuts.popo) && <div className={styles.warning}>Push to talk contains your Hands-free shortcut. Both actions may trigger.</div>}
    <SettingGroup>
      {SHORTCUTS.map((item) => <SettingRow key={item.action} title={item.title} description={item.description}>
        <div className={styles.shortcutControls}>{s.shortcuts[item.action].map((combo) => <span key={combo}><Kbd combo={combo} /><button aria-label={`Remove ${combo}`} onClick={() => void api.settings.setShortcut(item.action, s.shortcuts[item.action].filter((x) => x !== combo))}>×</button></span>)}<Button variant="outline" size="sm" onClick={() => beginCapture(item.action)}>Add another</Button></div>
      </SettingRow>)}
    </SettingGroup>
    <Button variant="ghost" onClick={() => void api.settings.resetShortcuts()}>Reset to default</Button>
    <Dialog open={capturing} onClose={() => { api.settings.cancelRecordShortcut(); setCapturing(false); }} title={`Change ${SHORTCUTS.find((x) => x.action === editing)?.title ?? 'shortcut'}`} description="Press key or mouse button">
      <Input autoFocus aria-label="Shortcut capture" placeholder="Press key or mouse button" onKeyDown={(e) => {
        e.preventDefault();
        if (!editing) return;
        const parts = [e.ctrlKey && 'Ctrl', e.metaKey && 'Win', e.altKey && 'Alt', e.shiftKey && 'Shift', !['Control', 'Meta', 'Alt', 'Shift'].includes(e.key) && (e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key)].filter(Boolean);
        void save(editing, parts.join('+'));
      }} />
      {error && <p className={styles.error} role="alert">{error}</p>}
    </Dialog>
  </>;
}

function SystemSection({ s, patch }: SectionProps) {
  const [scratch, setScratch] = useState(false);
  const [reset, setReset] = useState(false);
  const exclusiveAudio = (key: 'muteAudioWhileDictating' | 'pauseMediaWhileDictating', value: boolean) => void patch({ [key]: value, ...(value ? { [key === 'muteAudioWhileDictating' ? 'pauseMediaWhileDictating' : 'muteAudioWhileDictating']: false } : {}) } as DeepPartial<Settings>);
  return <>
    <SectionTitle>System</SectionTitle>
    <SettingGroup title="App settings">
      <SettingRow title="Launch app at login"><Toggle label="Launch app at login" checked={s.launchAtLogin} onChange={(launchAtLogin) => void patch({ launchAtLogin })} /></SettingRow>
      <SettingRow title="Show Flow Bar at all times"><Toggle label="Show Flow Bar" checked={s.showFlowBar} onChange={(showFlowBar) => void patch({ showFlowBar })} /></SettingRow>
      <SettingRow title="Flow Bar position"><Segmented value={s.flowBarDock} options={[{ value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} onChange={(flowBarDock) => void patch({ flowBarDock })} /></SettingRow>
    </SettingGroup>
    <SettingGroup title="Sound">
      <SettingRow title="Dictation and notification sounds"><Toggle label="Sounds" checked={s.sounds} onChange={(sounds) => void patch({ sounds })} /></SettingRow>
      <SettingRow title="Mute all audio while dictating"><Toggle label="Mute audio" checked={s.muteAudioWhileDictating} onChange={(v) => exclusiveAudio('muteAudioWhileDictating', v)} /></SettingRow>
      <SettingRow title="Pause media while dictating" description="Experimental"><Toggle label="Pause media" checked={s.pauseMediaWhileDictating} onChange={(v) => exclusiveAudio('pauseMediaWhileDictating', v)} /></SettingRow>
    </SettingGroup>
    <SettingGroup title="Notifications">
      {([['suggestions', 'Suggestions', 'Tips about getting set up or improving how you use Murmur.'], ['announcements', 'Announcements', 'New features or capabilities'], ['milestones', 'Milestones', 'Word-count milestones and streaks'], ['processingDelay', 'Processing delay', 'Warn when processing is delayed']] as const).map(([key, title, description]) => <SettingRow key={key} title={title} description={description}><Toggle label={title} checked={s.notifications[key]} onChange={(v) => void patch({ notifications: { ...s.notifications, [key]: v } })} /></SettingRow>)}
    </SettingGroup>
    <SettingGroup title="Dictation reminder">
      <SettingRow title="Where reminders appear"><Select value={s.typingReminder.mode} options={[{ value: 'disabled', label: 'Disabled' }, { value: 'all', label: 'All apps' }, { value: 'previously_used', label: 'Previously used apps' }, { value: 'categories', label: 'Selected categories' }]} onChange={(mode) => void patch({ typingReminder: { ...s.typingReminder, mode } })} /></SettingRow>
      {s.typingReminder.mode === 'categories' && <SettingRow title="Categories"><div>{['AI', 'Documents & notes', 'Email', 'Personal messaging', 'Work messaging'].map((label) => <Checkbox key={label} label={label} checked={s.typingReminder.categories.includes(label)} onChange={(v) => void patch({ typingReminder: { ...s.typingReminder, categories: v ? [...s.typingReminder.categories, label] : s.typingReminder.categories.filter((x) => x !== label) } })} />)}</div></SettingRow>}
      <SettingRow title="Mute reminders for 12 hours"><Button variant="outline" size="sm" onClick={() => void patch({ typingReminder: { ...s.typingReminder, mutedUntil: Date.now() + 43_200_000 } })}>Mute 12h</Button></SettingRow>
    </SettingGroup>
    <SettingGroup title="Scratchpad"><SettingRow title="Scratchpad open behavior" description={s.scratchpadOpenBehavior.replaceAll('_', ' ')}><Button variant="outline" size="sm" onClick={() => setScratch(true)}>Customize</Button></SettingRow></SettingGroup>
    <SettingGroup title="Extras">
      <SettingRow title="Auto-add to dictionary" description="Adds corrected words automatically"><Toggle label="Auto-add to dictionary" checked={s.autoAddToDictionary} onChange={(autoAddToDictionary) => void patch({ autoAddToDictionary })} /></SettingRow>
      <SettingRow title="Creator mode" description={'Show "Dictating with Murmur" when dictating'}><Toggle label="Creator mode" checked={s.creatorMode} onChange={(creatorMode) => void patch({ creatorMode })} /></SettingRow>
      <SettingRow title="Smart Formatting" description="Smart Formatting has moved to the Style Auto cleanup tab."><Button variant="outline" size="sm" onClick={() => void api.app.openHub('/style')}>Open Style</Button></SettingRow>
      <SettingRow title="Email signature" description="Add a Murmur signature to dictated email"><div className={styles.inline}><Toggle label="Email signature" checked={s.emailSignature.enabled} onChange={(enabled) => void patch({ emailSignature: { ...s.emailSignature, enabled } })} />{s.emailSignature.enabled && <Select value={s.emailSignature.option} options={[{ value: 'written', label: 'Written with Murmur' }, { value: 'spoken', label: 'Spoken with Murmur' }]} onChange={(option) => void patch({ emailSignature: { ...s.emailSignature, option } })} />}</div></SettingRow>
      <SettingRow title="Add Murmur to LinkedIn" description="Showcase Murmur under Apps on your LinkedIn profile"><Button variant="outline" size="sm" onClick={() => toast('LinkedIn requires a cloud account — not available offline')}>Connect</Button></SettingRow>
    </SettingGroup>
    <SettingGroup title="Data">
      <SettingRow title="Reset app" description="Reset only if advised by support."><Button variant="danger" size="sm" onClick={() => setReset(true)}>Reset &amp; restart</Button></SettingRow>
      <SettingRow title="Restart tutorial" description="Keep your history and settings"><Button variant="outline" size="sm" onClick={() => void patch({ onboardingComplete: false, onboardingStep: 'welcome' })}>Restart tutorial</Button></SettingRow>
    </SettingGroup>
    <Dialog open={scratch} onClose={() => setScratch(false)} title="Scratchpad open behavior" footer={<Button onClick={() => setScratch(false)}>Done</Button>}>
      <Segmented value={s.scratchpadOpenBehavior} options={[{ value: 'resume', label: 'Resume last note' }, { value: 'new_tab', label: 'Open in new tab' }, { value: 'last_pinned', label: 'Open last active pinned note' }]} onChange={(scratchpadOpenBehavior) => void patch({ scratchpadOpenBehavior })} />
    </Dialog>
    <Dialog open={reset} onClose={() => setReset(false)} title="Reset app?" description="This deletes local history and restarts Murmur." footer={<><Button variant="outline" onClick={() => setReset(false)}>Cancel</Button><Button variant="danger" onClick={() => void api.app.resetApp()}>Reset app</Button></>}></Dialog>
  </>;
}

function NotetakerSection({ s, patch }: SectionProps) {
  const n = s.notetaker;
  const p = (value: Partial<typeof n>) => void patch({ notetaker: { ...n, ...value } });
  const [editConsent, setEditConsent] = useState(false);
  return <>
    <div className={styles.headingLine}><SectionTitle>Notetaker</SectionTitle><Button variant="outline" onClick={() => void patch({ onboardingComplete: false, onboardingStep: 'permissions' })}>Start tutorial</Button></div>
    <SettingGroup title="Meeting detection">
      <SettingRow title="Notify before scheduled meetings start" description="Choose when to get a heads-up"><Select value={String(n.notifyBeforeMeetingMin)} options={[{ value: '0', label: 'Never' }, { value: '0.25', label: 'Right before' }, { value: '1', label: '1 min' }, { value: '2', label: '2 min' }]} onChange={(v) => p({ notifyBeforeMeetingMin: Number(v) as typeof n.notifyBeforeMeetingMin })} /></SettingRow>
      <SettingRow title="Automatically detect any call" description="Murmur asks if you want to start a note"><Toggle label="Detect calls" checked={n.autoDetectCalls} onChange={(autoDetectCalls) => p({ autoDetectCalls })} /></SettingRow>
      <SettingRow title="Start Notetaker automatically" description="Start Notetaker when a meeting begins"><Toggle label="Auto start" checked={n.autoStart} onChange={(autoStart) => p({ autoStart })} /></SettingRow>
      <SettingRow title="Maximum recording length" description="Notetaker stops automatically at this length"><Select ariaLabel="Maximum recording length" value={n.maxRecordingMin} options={([30, 60, 120, 180, 240, 360] as const).map((value) => ({ value, label: value < 60 ? '30 minutes' : `${value / 60} hour${value === 60 ? '' : 's'}` }))} onChange={(maxRecordingMin) => p({ maxRecordingMin })} /></SettingRow>
      <SettingRow title="Stop Notetaker when a call ends"><Toggle label="Stop when call ends" checked={n.stopWhenCallEnds} onChange={(stopWhenCallEnds) => p({ stopWhenCallEnds })} /></SettingRow>
    </SettingGroup>
    <SettingGroup title="While Notetaker is active"><SettingRow title="Don't show Notepad and Flow Bar in screen capture" description="Always ask for consent before transcribing."><Toggle label="Hide in screen capture" checked={n.hideInScreenCapture} onChange={(hideInScreenCapture) => p({ hideInScreenCapture })} /></SettingRow></SettingGroup>
    <SettingGroup title="Notepad">
      <SettingRow title="Notepad View" description="Choose your default view"><Select value={n.notepadView} options={[{ value: 'open', label: 'Open Notepad' }, { value: 'hidden', label: 'Keep Notepad hidden' }, { value: 'side_by_side', label: 'Open side by side' }]} onChange={(notepadView) => p({ notepadView })} /></SettingRow>
      <SettingRow title="Keyboard shortcut" description={`Press ${s.shortcuts.startNotetaker[0] ?? 'Not set'} to join a meeting`}><Button variant="outline" size="sm" onClick={() => useHubUi.getState().openSettings('shortcuts')}>Change shortcut</Button></SettingRow>
    </SettingGroup>
    <SettingGroup title="Transcript">
      <SettingRow title="Show live transcript" description="See the words appear while Notetaker is on"><Toggle label="Live transcript" checked={n.showLiveTranscript} onChange={(showLiveTranscript) => p({ showLiveTranscript })} /></SettingRow>
      <SettingRow title="Show speaker names"><Toggle label="Speaker names" checked={n.speakerNames} onChange={(speakerNames) => p({ speakerNames })} /></SettingRow>
      <SettingRow title="Open summary when ready"><Toggle label="Open summary" checked={n.openSummaryWhenReady} onChange={(openSummaryWhenReady) => p({ openSummaryWhenReady })} /></SettingRow>
    </SettingGroup>
    <SettingGroup title="Consent">
      <SettingRow title="Calendar notice" description="Indicate you'll be using Notetaker in calendar events"><Select value="off" options={[{ value: 'off', label: 'Off' }, { value: 'notice', label: 'Notice only' }, { value: 'link', label: 'Notice and notes link' }]} onChange={() => toast('Calendar notices require a cloud account — not available offline')} /></SettingRow>
      <SettingRow title="Post a consent notice in the meeting chat" description="Lets everyone know you're transcribing"><div className={styles.inline}><Toggle label="Consent chat notice" checked={n.consentChatNotice} onChange={(consentChatNotice) => p({ consentChatNotice })} /><Button variant="outline" size="sm" onClick={() => setEditConsent(true)}>Edit message</Button></div></SettingRow>
    </SettingGroup>
    <SettingGroup title="Sharing">
      <SettingRow title="Default for Notetaker links" description="Transcripts stay local"><Select value="private" options={[{ value: 'anyone', label: 'Anyone with link' }, { value: 'team', label: 'Shared with team' }, { value: 'private', label: 'Private' }]} onChange={() => toast('Sharing requires a cloud account — not available offline')} /></SettingRow>
      <SettingRow title="Auto-share notes" description="When notes are ready, share them with no one"><Toggle label="Auto-share notes" checked={false} disabled onChange={() => undefined} /></SettingRow>
      <SettingRow title="Quote in share emails" description="Include one line from the meeting"><Toggle label="Quote in emails" checked={false} disabled onChange={() => undefined} /></SettingRow>
      <SettingRow title="Import your meeting notes" description="Bring over every past meeting note, summary, and transcript"><Button variant="outline" onClick={() => void api.app.openHub('/notetaker')}>Import</Button></SettingRow>
    </SettingGroup>
    <Dialog open={editConsent} onClose={() => setEditConsent(false)} title="Consent notice" footer={<><Button variant="ghost" onClick={() => p({ consentMessage: DEFAULT_SETTINGS.notetaker.consentMessage })}>Reset</Button><Button onClick={() => setEditConsent(false)}>Done</Button></>}>
      <TextArea aria-label="Consent message" value={n.consentMessage} onChange={(e) => p({ consentMessage: e.target.value })} rows={5} />
    </Dialog>
  </>;
}

function VibeSection({ s, patch }: SectionProps) {
  const [setup, setSetup] = useState(false);
  return <><SectionTitle>Vibe coding</SectionTitle><SettingGroup>
    <SettingRow title="Variable recognition" description="Understand code variables by reading the open file in VS Code, Cursor, or Devin."><Button variant="outline" onClick={() => setSetup(true)}>Set up</Button></SettingRow>
    <SettingRow title="File Tagging in Chat" description="Tag IDE files so spoken references become usable context"><Toggle label="File tagging" checked={s.vibeCoding.fileTagging} onChange={(fileTagging) => void patch({ vibeCoding: { ...s.vibeCoding, fileTagging } })} /></SettingRow>
  </SettingGroup><Dialog open={setup} onClose={() => setSetup(false)} title="Set up variable recognition" footer={<Button onClick={() => { void patch({ vibeCoding: { ...s.vibeCoding, variableRecognition: true } }); setSetup(false); }}>I've enabled it</Button>}><ol><li>Open the Command Palette in VS Code or Cursor.</li><li>Run <b>Toggle Screen Reader Accessibility Mode</b>.</li><li>Choose <b>Screen Reader Optimized</b>.</li></ol></Dialog></>;
}

function ExperimentalSection({ s, patch }: SectionProps) {
  const [apps, setApps] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  useEffect(() => { void api.app.listRunningApps().then(setApps); }, []);
  const addUrl = () => {
    const clean = url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!clean) return;
    if (s.focusMode.blockedUrls.includes(clean)) { setUrlError('This URL is already blocked.'); return; }
    void patch({ focusMode: { ...s.focusMode, blockedUrls: [...s.focusMode.blockedUrls, clean] } }); setUrl(''); setUrlError('');
  };
  const importKind = async (kind: 'dictionary' | 'snippets') => {
    const path = await api.app.pickFile([{ name: 'Import file', extensions: ['txt', 'csv', 'json'] }]);
    if (!path) return;
    const result = await api.app.importFile(kind, path);
    toast(`Imported ${result.imported} ${kind} items`, { body: result.skipped ? `${result.skipped} skipped` : undefined });
  };
  return <><SectionTitle>Experimental</SectionTitle><SettingGroup>
    <SettingRow title="Command Mode" description="Enable advanced voice commands"><Toggle label="Command Mode" checked={s.commandModeEnabled} onChange={(commandModeEnabled) => void patch({ commandModeEnabled })} /></SettingRow>
    <SettingRow title="Press Enter command" description={'Saying "press enter" can send a message immediately. Review text before enabling.'}><Toggle label="Press Enter command" checked={s.pressEnterCommandEnabled} onChange={(pressEnterCommandEnabled) => void patch({ pressEnterCommandEnabled })} /></SettingRow>
    <SettingRow title="Stacked messages" description="Split one dictation into separate messages"><Toggle label="Stacked messages" checked={s.stackedMessages} onChange={(stackedMessages) => void patch({ stackedMessages })} /></SettingRow>
    <SettingRow title="Focus Mode" description="Block distracting apps and websites"><Toggle label="Focus Mode" checked={s.focusMode.enabled} onChange={(enabled) => void patch({ focusMode: { ...s.focusMode, enabled } })} /></SettingRow>
  </SettingGroup><SettingGroup title="Blocked apps">
    {apps.length === 0 ? <p className={styles.muted}>No running apps found.</p> : apps.map((app) => { const added = s.focusMode.blockedApps.includes(app); return <SettingRow key={app} title={app}><Button size="sm" variant={added ? 'ghost' : 'outline'} onClick={() => void patch({ focusMode: { ...s.focusMode, blockedApps: added ? s.focusMode.blockedApps.filter((x) => x !== app) : [...s.focusMode.blockedApps, app] } })}>{added ? 'Added' : 'Add'}</Button></SettingRow>; })}
  </SettingGroup><SettingGroup title="Blocked URLs">
    <div className={styles.addRow}><Input aria-label="Blocked URL" placeholder="example.com" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addUrl(); }} /><Button onClick={addUrl}>Add</Button></div>{urlError && <p className={styles.error}>{urlError}</p>}
    <div className={styles.chips}>{s.focusMode.blockedUrls.map((item) => <span key={item}>{item}<button aria-label={`Remove ${item}`} onClick={() => void patch({ focusMode: { ...s.focusMode, blockedUrls: s.focusMode.blockedUrls.filter((x) => x !== item) } })}>×</button></span>)}</div>
  </SettingGroup><SettingGroup title="Bulk import"><div className={styles.inline}><Button variant="outline" onClick={() => void importKind('dictionary')}>Import dictionary</Button><Button variant="outline" onClick={() => void importKind('snippets')}>Import snippets</Button></div></SettingGroup></>;
}

function AiSection({ s, patch }: SectionProps) {
  const [status, setStatus] = useState('');
  const [test, setTest] = useState('');
  const [models, setModels] = useState<AsrModelInfo[]>([]);
  const [asrStatus, setAsrStatus] = useState('');
  const [progress, setProgress] = useState<Record<string, number>>({});
  const probe = (provider: LlmProvider) => void api.engines.llmStatus(provider).then((r) => setStatus(r.available ? `${r.version ?? provider} available` : r.error ?? `${provider} unavailable`));
  useEffect(() => { probe(s.llm.provider); void api.engines.asrModels().then(setModels); void api.engines.asrStatus().then((r) => setAsrStatus(r.ready ? `${r.model} ready` : r.error ?? 'Not ready')); }, [s.llm.provider]);
  useEvent('asr:download', (p) => { setProgress((old) => ({ ...old, [p.id]: p.total ? p.received / p.total : 0 })); if (p.done) void api.engines.asrModels().then(setModels); });
  useEvent('asr:status', (p) => setAsrStatus(p.ready ? `${p.model} ready` : p.error ?? 'Not ready'));
  return <><SectionTitle>AI &amp; Speech</SectionTitle><SettingGroup title="AI provider">
    <SettingRow title="Provider" description={status}><Segmented value={s.llm.provider} options={[{ value: 'claude', label: 'Claude' }, { value: 'codex', label: 'Codex' }, { value: 'none', label: 'None' }]} onChange={(provider) => void patch({ llm: { ...s.llm, provider } })} /></SettingRow>
    <SettingRow title="Test provider" description={test || 'Run a small local CLI request'}><Button variant="outline" disabled={s.llm.provider === 'none'} onClick={() => { setTest('Testing…'); void api.engines.testLlm(s.llm.provider).then((r) => setTest(`${r.ok ? 'Ready' : 'Failed'} in ${r.ms}ms — ${r.output}`)); }}>Test</Button></SettingRow>
    <SettingRow title="Claude model"><Input value={s.llm.claudeModel} onChange={(e) => void patch({ llm: { ...s.llm, claudeModel: e.target.value } })} /></SettingRow>
    <SettingRow title="Codex model"><Input placeholder="Default" value={s.llm.codexModel} onChange={(e) => void patch({ llm: { ...s.llm, codexModel: e.target.value } })} /></SettingRow>
    <SettingRow title="Timeout"><Input aria-label="AI timeout seconds" type="number" min={5} max={300} value={s.llm.timeoutSec} onChange={(e) => void patch({ llm: { ...s.llm, timeoutSec: Number(e.target.value) } })} /></SettingRow>
  </SettingGroup><SettingGroup title="Speech model">
    <p className={styles.muted}>Status: {asrStatus}</p>
    {models.map((model) => <SettingRow key={model.id} title={model.label} description={`${model.sizeMb} MB · ${model.multilingual ? '99 languages' : 'English only'}`}><div className={styles.inline}>{progress[model.id] > 0 && progress[model.id] < 1 && <Progress value={progress[model.id]} />}{model.installed ? <Button size="sm" variant={s.asr.model === model.id ? 'ghost' : 'outline'} onClick={() => void patch({ asr: { ...s.asr, model: model.id } })}>{s.asr.model === model.id ? 'In use' : 'Use'}</Button> : <Button size="sm" variant="outline" onClick={() => void api.engines.downloadAsrModel(model.id)}>Download</Button>}</div></SettingRow>)}
    <SettingRow title="CPU threads" description="More threads can improve transcription speed"><Input aria-label="CPU threads" type="number" min={1} max={32} value={s.asr.threads} onChange={(e) => void patch({ asr: { ...s.asr, threads: Number(e.target.value) } })} /></SettingRow>
  </SettingGroup></>;
}

function ConnectorsSection({ s, patch }: SectionProps) {
  const [url, setUrl] = useState('');
  const addFile = async () => { const path = await api.app.pickFile([{ name: 'Calendar', extensions: ['ics'] }]); if (path) void patch({ notetaker: { ...s.notetaker, calendarIcsSources: [...s.notetaker.calendarIcsSources, path] } }); };
  const addUrl = () => { if (/^https?:\/\//.test(url) && !s.notetaker.calendarIcsSources.includes(url)) { void patch({ notetaker: { ...s.notetaker, calendarIcsSources: [...s.notetaker.calendarIcsSources, url] } }); setUrl(''); } };
  return <><SectionTitle>Connectors</SectionTitle><p className={styles.lede}>Connected apps improve reminders, summaries, and briefs. Murmur's calendar equivalent works with local .ics files or public calendar URLs.</p>
    <SettingGroup title="Calendar (.ics)"><div className={styles.inline}><Button variant="outline" onClick={() => void addFile()}>Add .ics file</Button><Input aria-label="Calendar ICS URL" placeholder="https://…/calendar.ics" value={url} onChange={(e) => setUrl(e.target.value)} /><Button onClick={addUrl}>Add URL</Button></div>{s.notetaker.calendarIcsSources.map((source) => <SettingRow key={source} title={source}><Button variant="ghost" size="sm" onClick={() => void patch({ notetaker: { ...s.notetaker, calendarIcsSources: s.notetaker.calendarIcsSources.filter((x) => x !== source) } })}>Remove</Button></SettingRow>)}</SettingGroup>
    <SettingGroup title="Cloud connectors">{['Google Calendar', 'Outlook Calendar', 'Gmail', 'Slack', 'Notion', 'GitHub', 'Linear', 'Zoom', 'Fireflies'].map((name) => <SettingRow key={name} title={name} description="Bring relevant context into Murmur"><Button variant="outline" size="sm" onClick={() => toast('Requires a cloud account — not available offline')}>Connect</Button></SettingRow>)}</SettingGroup>
  </>;
}

function McpSection() {
  const [app, setApp] = useState<string | null>(null);
  const [config, setConfig] = useState('');
  const open = async (name: string) => { const command = await api.mcp.serverCommand(); setConfig(command.configJson); setApp(name); };
  return <><SectionTitle>MCP</SectionTitle><p className={styles.lede}>Sync Notetaker with your favorite AI apps. Give local AI tools access to meeting notes and transcripts — never dictations.</p><div className={styles.cardGrid}>{['Claude', 'ChatGPT', 'Gemini', 'Cursor'].map((name) => <div className={styles.appCard} key={name}><Puzzle /><h3>{name}</h3><p>Allow {name} to access your local meeting notes and transcripts.</p><Button variant="outline" onClick={() => void open(name)}>Add to {name}</Button></div>)}</div><SettingGroup title="All other apps"><SettingRow title="Custom MCP configuration" description="Use this with any app that supports a local MCP server."><Button variant="outline" onClick={() => void open('another app')}>Show config</Button></SettingRow></SettingGroup>
    <Dialog open={app !== null} onClose={() => setApp(null)} title={`Add to ${app ?? ''}`} description="Paste this JSON into the app's MCP server configuration." footer={<Button onClick={() => { void api.app.copyText(config); toast('Configuration copied'); }}>Copy JSON</Button>}><pre className={styles.code}>{config}</pre></Dialog>
  </>;
}

function AccountSection({ s, patch }: SectionProps) {
  const [profile, setProfile] = useState(s.profile);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const chooseAvatar = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Profile picture must be 5 MB or smaller', { tone: 'error' }); return; }
    const reader = new FileReader(); reader.onload = () => setProfile({ ...profile, avatarDataUrl: String(reader.result) }); reader.readAsDataURL(file);
  };
  return <><SectionTitle>Account</SectionTitle><SettingGroup title="Local profile">
    <div className={styles.profile}>{profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="Profile" /> : <User size={32} />}<label className={styles.fileButton}>Choose picture<input type="file" accept="image/*" onChange={(e) => chooseAvatar(e.target.files?.[0])} /></label></div>
    <div className={styles.formGrid}><Field label="First name"><Input value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} /></Field><Field label="Last name"><Input value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} /></Field><Field label="Email"><Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field></div>
    <Button disabled={!profile.firstName.trim() || !profile.lastName.trim()} onClick={() => { void patch({ profile }); toast('Local profile saved', { tone: 'success' }); }}>Save</Button>
  </SettingGroup><SettingGroup title="Account actions"><SettingRow title="Sign out" description="There is no cloud session. Your profile is stored only on this device."><Button variant="outline" onClick={() => setDeleteOpen(true)}>Delete local data</Button></SettingRow><SettingRow title="Delete account" description="Murmur has no cloud account. You can delete everything stored locally."><Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete all local data</Button></SettingRow></SettingGroup><Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete local data?" description="Use Data and Privacy to choose which categories to remove." footer={<Button onClick={() => { setDeleteOpen(false); useHubUi.getState().openSettings('data'); }}>Go to Data and Privacy</Button>} /></>;
}

function TeamSection() {
  return <><SectionTitle>Team</SectionTitle><OfflineNotice/><div className={styles.heroCard}><Users size={40}/><h2>Bring your team to Murmur</h2><p>Share a dictionary, snippets, and writing conventions across your workspace.</p><Button disabled>Create team</Button></div><SettingGroup title="Team members"><SettingRow title="Invite teammates" description="Team invites and organization management require a cloud service."><Button disabled variant="outline">Invite people</Button></SettingRow><SettingRow title="Members and roles" description="Member, Admin, IT admin, and Super admin roles are available in cloud workspaces." /></SettingGroup></>;
}

function PlansSection() {
  return <><SectionTitle>Plans and Billing</SectionTitle><OfflineNotice/><div className={styles.planGrid}><div className={styles.plan}><Badge>Current plan</Badge><h2>Local</h2><strong>$0 / month</strong><ul><li>Unlimited local dictation</li><li>100+ languages with multilingual Whisper</li><li>Local Notetaker history</li><li>Your own Claude or Codex CLI</li></ul><Button disabled>Current plan</Button></div><div className={styles.plan}><Badge tone="accent">Offline-first</Badge><h2>Murmur</h2><strong>No subscription</strong><p>There are no paid upgrades or billing details. Everything runs on your computer.</p></div></div></>;
}

function DataSection({ s, patch }: SectionProps) {
  const categories = ['dictation', 'dictionary', 'meetings', 'notes', 'todos'] as const;
  const [download, setDownload] = useState<string[]>(['everything']);
  const [deleting, setDeleting] = useState<string[]>([]);
  const [phrase, setPhrase] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  return <><SectionTitle>Data and Privacy</SectionTitle><SettingGroup>
    <SettingRow title="Improve the model for everyone" description="Disabled — Murmur never uploads training data."><Toggle label="Improve model" checked={false} disabled onChange={() => undefined} /></SettingRow>
    <SettingRow title="Dictation cloud storage" description="Disabled — Murmur stores data locally."><Toggle label="Cloud storage" checked={false} disabled onChange={() => undefined} /></SettingRow>
    <SettingRow title="Context awareness" description="Use limited relevant active-app text to improve names and meaning."><Toggle label="Context awareness" checked={s.contextAwareness} onChange={(contextAwareness) => void patch({ contextAwareness })} /></SettingRow>
    <SettingRow title="Local data storage"><Select ariaLabel="Local data storage" value={s.localDataStorage} options={[{ value: 'store_normally', label: 'Store normally' }, { value: 'auto_delete_24h', label: 'Auto-delete after 24 hours' }, { value: 'never_store', label: 'Never store dictations' }]} onChange={(localDataStorage) => void patch({ localDataStorage })} /></SettingRow>
    <SettingRow title="Store audio" description="Keep source audio with local dictation history"><Toggle label="Store audio" checked={s.storeAudio} onChange={(storeAudio) => void patch({ storeAudio })} /></SettingRow>
  </SettingGroup><SettingGroup title="Download your data"><div className={styles.checkGrid}>{['everything', ...categories].map((category) => <Checkbox key={category} label={category[0].toUpperCase() + category.slice(1)} checked={download.includes(category)} onChange={(v) => setDownload(v ? [...download.filter((x) => x !== 'everything'), category] : download.filter((x) => x !== category))} />)}</div><Button onClick={() => void api.app.exportData(download).then((path) => path && toast('Data exported', { body: path, tone: 'success' }))}>Download your data</Button></SettingGroup>
    <SettingGroup title="Delete your data"><p className={styles.muted}>Choose categories. Your local profile and settings remain.</p><div className={styles.checkGrid}>{categories.map((category) => <Checkbox key={category} label={category[0].toUpperCase() + category.slice(1)} checked={deleting.includes(category)} onChange={(v) => setDeleting(v ? [...deleting, category] : deleting.filter((x) => x !== category))} />)}</div><Button variant="danger" disabled={!deleting.length} onClick={() => setDeleteOpen(true)}>Delete selected data</Button></SettingGroup>
    <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your data" description="This cannot be undone. Type DELETE to confirm." footer={<Button variant="danger" disabled={phrase !== 'DELETE'} onClick={() => { void api.app.deleteData(deleting); setDeleteOpen(false); setPhrase(''); setDeleting([]); toast('Selected local data deleted'); }}>Delete permanently</Button>}><Input aria-label="Type DELETE" value={phrase} onChange={(e) => setPhrase(e.target.value)} /></Dialog>
  </>;
}

interface SectionProps {
  s: Settings;
  patch: (p: DeepPartial<Settings>) => Promise<Settings>;
}

function SettingsContent(props: SectionProps & { section: SettingsSection }) {
  switch (props.section) {
    case 'general': return <GeneralSection {...props} />;
    case 'shortcuts': return <ShortcutsSection {...props} />;
    case 'system': return <SystemSection {...props} />;
    case 'notetaker': return <NotetakerSection {...props} />;
    case 'vibe-coding': return <VibeSection {...props} />;
    case 'experimental': return <ExperimentalSection {...props} />;
    case 'ai': return <AiSection {...props} />;
    case 'connectors': return <ConnectorsSection {...props} />;
    case 'mcp': return <McpSection />;
    case 'account': return <AccountSection {...props} />;
    case 'team': return <TeamSection />;
    case 'plans': return <PlansSection />;
    case 'data': return <DataSection {...props} />;
  }
}

export function SettingsDialog() {
  const open = useHubUi((s) => s.settingsOpen);
  const section = useHubUi((s) => s.settingsSection);
  const close = useHubUi((s) => s.closeSettings);
  const setSection = useHubUi((s) => s.openSettings);
  const settings = useSettings();
  const patch = usePatchSettings();
  const [version, setVersion] = useState('');
  const [needsAttention, setNeedsAttention] = useState(false);
  useEffect(() => {
    if (!open) return;
    void api.app.getVersion().then(setVersion);
    void api.engines.llmStatus().then((status) => setNeedsAttention(settings.llm.provider !== 'none' && !status.available)).catch(() => setNeedsAttention(true));
  }, [open, settings.llm.provider]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  if (!open) return null;
  return <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Settings">
      <aside className={styles.sidebar}>
        <div className={styles.navLabel}>SETTINGS</div>
        {SETTINGS_NAV.map((item) => <NavButton key={item.id} item={item} active={section === item.id || (section === 'shortcuts' && item.id === 'general')} attention={item.id === 'general' && needsAttention} onClick={() => setSection(item.id)} />)}
        <div className={styles.navLabel}>ACCOUNT</div>
        {ACCOUNT_NAV.map((item) => <NavButton key={item.id} item={item} active={section === item.id} onClick={() => setSection(item.id)} />)}
        <div className={styles.version}>Murmur v{version}</div>
      </aside>
      <main className={styles.content}><button className={styles.close} aria-label="Close settings" onClick={close}><X size={18} /></button><SettingsContent section={section} s={settings} patch={patch} /></main>
    </section>
  </div>;
}

function NavButton({ item, active, attention, onClick }: { item: { label: string; icon: typeof Settings2 }; active: boolean; attention?: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={`${styles.navButton} ${active ? styles.active : ''}`} onClick={onClick}><Icon size={17}/><span>{item.label}</span>{attention && <span className={styles.attention} title="Needs attention">1</span>}</button>;
}
