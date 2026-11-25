import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, Keyboard, Lock, Mic, MonitorUp, Sparkles } from 'lucide-react';
import type { StyleContext, StyleTone } from '@shared/types';
import type { Settings } from '@shared/settings';
import { applyTone, capitalize, ensureTerminalPunctuation } from '@shared/textPipeline';
import { api, useEvent } from '../../lib/api';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { Button, Checkbox, Input, Kbd, Segmented } from '../../ui';
import { Logo } from '../shell/Logo';
import styles from './Onboarding.module.css';

type Stage = 'signup' | 'permissions' | 'setup' | 'learn' | 'personalize';
const STAGES: { id: Stage; label: string }[] = [
  { id: 'signup', label: 'SIGN UP' },
  { id: 'permissions', label: 'PERMISSIONS' },
  { id: 'setup', label: 'SET UP' },
  { id: 'learn', label: 'LEARN' },
  { id: 'personalize', label: 'PERSONALIZE' },
];

const OPTIONS = {
  heard: ['A friend or coworker', 'YouTube', 'Search', 'Social media', 'Podcast', 'Other'],
  roles: ['Founder / CEO', 'Consultant', 'Operations', 'Developer', 'Product', 'Data Analysis', 'Sales', 'Marketing', 'Customer Support', 'Recruiting', 'Creator', 'Writer', 'Student', 'Healthcare', 'Legal', 'Educator', 'Real Estate', 'Other'],
  work: ['Executive', 'Director', 'Manager', 'Individual contributor', 'Freelancer', 'Student', 'Other'],
  typing: ['Chatting / Coding with AI', 'Emails', 'Messages', 'Notes', 'Documents', 'Essays', 'Discussion posts', 'Problem sets', 'Posts and comments', 'Something else'],
  writing: ['Capture ideas quickly', 'Code with AI more easily', 'Write detailed prompts', 'Create documents faster', 'Reduce typing fatigue', 'Work hands-free', 'Handle many emails', 'Handle many messages'],
  tools: ['Fathom', 'Fireflies', 'Google Meet', 'Grain', 'Granola', 'Notion', 'Otter', 'Plaud', 'Teams', 'Zoom', 'Other', 'None'],
  frustrations: ['Finding old notes', 'Preparing for meetings', 'Taking notes during calls', 'Tracking action items', 'Other'],
  meetingTypes: ['Catch-ups', 'Lectures', 'Client calls', 'Interviews', 'Executive meetings', '1:1s', 'Sales calls', 'Team meetings', 'Other'],
};

function ChoiceGrid({ values, selected, onChange, multiple = false }: { values: readonly string[]; selected: string[]; onChange: (v: string[]) => void; multiple?: boolean }) {
  return <div className={styles.choices}>{values.map((value) => {
    const active = selected.includes(value);
    return <button type="button" aria-pressed={active} className={active ? styles.selected : ''} key={value} onClick={() => onChange(multiple ? active ? selected.filter((x) => x !== value) : [...selected, value] : [value])}>{active && <Check size={15} />}{value}</button>;
  })}</div>;
}

function Preview({ intent, name }: { intent: 'dictation' | 'notetaker'; name: string }) {
  return <div className={styles.previewWindow}>
    <div className={styles.previewTop}><i/><i/><i/></div>
    {intent === 'dictation' ? <><span className={styles.previewLabel}>New email</span><strong>Project update</strong><p>Hi team,</p><p>The latest build is ready to review. I cleaned up the notes and added next steps for everyone.</p><p>Thanks,<br/>{name || 'You'}</p><span className={styles.previewSticker}>Polished by Murmur</span></> : <><span className={styles.previewLabel}>Weekly product sync</span><strong>Meeting notes</strong><p><b>Alex</b> We’ll ship the new onboarding flow on Thursday.</p><p><b>{name || 'You'}</b> I’ll review the final accessibility pass today.</p><div className={styles.summary}><Sparkles size={16}/> Summary and action items appear automatically.</div></>}
  </div>;
}

function signupValid(step: number, profile: Settings['profile']): boolean {
  if (step === 0) return Boolean(profile.firstName.trim() && profile.lastName.trim());
  if (step === 1) return Boolean(profile.heardAbout);
  if (step === 2) return profile.intents.length > 0;
  if (step === 3) return Boolean(profile.role && profile.workType);
  if (step === 4) return profile.typingLocations.length > 0 && profile.writingNeeds.length > 0;
  if (step === 5) return profile.intents.includes('notetaker') ? profile.meetingTools.length > 0 && profile.meetingFrustrations.length > 0 && profile.meetingTypes.length > 0 : true;
  return true;
}

function SignupStep({ substep, next }: { substep: number; next: () => void }) {
  const s = useSettings();
  const patch = usePatchSettings();
  const profile = s.profile;
  const update = (value: Partial<typeof profile>) => void patch({ profile: { ...profile, ...value } });
  const content = [
    <div key="profile"><Eyebrow>LOCAL PROFILE</Eyebrow><h1>Let’s get you started</h1><p>Accurate voice-to-text, everywhere you work. Your profile stays on this computer.</p><div className={styles.carousel} aria-label="What Murmur can do"><span>4× faster typing</span><span>Perfectly formatted text</span><span>100+ languages</span><span>Works in any app</span><span>Captures every meeting detail</span></div><div className={styles.twoFields}><label>First name<Input autoFocus value={profile.firstName} onChange={(e) => update({ firstName: e.target.value })}/></label><label>Last name<Input value={profile.lastName} onChange={(e) => update({ lastName: e.target.value })}/></label></div><label>Email <span>(optional)</span><Input type="email" value={profile.email} onChange={(e) => update({ email: e.target.value })}/></label><p className={styles.terms}>Continuing means you agree to Murmur’s local Terms of Service and Privacy Policy. No account is created and no data is uploaded.</p></div>,
    <div key="heard"><Eyebrow>WELCOME {profile.firstName.toUpperCase()}</Eyebrow><h1>Where did you hear about us?</h1><p>This helps us understand how people find Murmur.</p><ChoiceGrid values={OPTIONS.heard} selected={profile.heardAbout ? [profile.heardAbout] : []} onChange={([heardAbout]) => update({ heardAbout })}/></div>,
    <div key="intent"><Eyebrow>MAKE MURMUR YOURS</Eyebrow><h1>How can Murmur help you?</h1><p>Choose one or both. You can change this later.</p><ChoiceGrid multiple values={['Dictation', 'Notetaker']} selected={profile.intents.map((x) => x === 'dictation' ? 'Dictation' : 'Notetaker')} onChange={(values) => update({ intents: values.map((x) => x.toLowerCase() as 'dictation' | 'notetaker') })}/></div>,
    <div key="role"><Eyebrow>ABOUT YOURSELF</Eyebrow><h1>What best describes your work?</h1><ChoiceGrid values={OPTIONS.roles} selected={profile.role ? [profile.role] : []} onChange={([role]) => update({ role })}/>{profile.role && <blockquote className={styles.testimonial}>“Murmur lets me capture ideas without breaking focus.”<footer>Trusted by people working in {profile.role.toLowerCase()}</footer></blockquote>}<h2>How do you work?</h2><ChoiceGrid values={OPTIONS.work} selected={profile.workType ? [profile.workType] : []} onChange={([workType]) => update({ workType })}/></div>,
    <div key="typing"><Eyebrow>YOUR WORKFLOW</Eyebrow><h1>Where do you type most?</h1><ChoiceGrid multiple values={OPTIONS.typing} selected={profile.typingLocations} onChange={(typingLocations) => update({ typingLocations })}/><h2>What would you like to make easier?</h2><ChoiceGrid multiple values={OPTIONS.writing} selected={profile.writingNeeds} onChange={(writingNeeds) => update({ writingNeeds })}/></div>,
    <div key="meetings"><Eyebrow>YOUR MEETINGS</Eyebrow><h1>Make Notetaker work for you</h1><h2>Meeting tools</h2><ChoiceGrid multiple values={OPTIONS.tools} selected={profile.meetingTools} onChange={(meetingTools) => update({ meetingTools })}/><h2>Biggest frustrations</h2><ChoiceGrid multiple values={OPTIONS.frustrations} selected={profile.meetingFrustrations} onChange={(meetingFrustrations) => update({ meetingFrustrations })}/><h2>Meeting types</h2><ChoiceGrid multiple values={OPTIONS.meetingTypes} selected={profile.meetingTypes} onChange={(meetingTypes) => update({ meetingTypes })}/></div>,
  ];
  const effectiveStep = substep === 5 && !profile.intents.includes('notetaker') ? 4 : substep;
  return <StepLayout preview={<Preview intent={profile.intents.includes('notetaker') && effectiveStep === 5 ? 'notetaker' : 'dictation'} name={profile.firstName}/>}>
    {content[effectiveStep]}
    <Footer><Button disabled={!signupValid(effectiveStep, profile)} onClick={next}>Continue</Button></Footer>
  </StepLayout>;
}

function PermissionsStep({ next }: { next: () => void }) {
  const s = useSettings();
  const patch = usePatchSettings();
  const [micState, setMicState] = useState<'idle' | 'working' | 'allowed' | 'failed'>('idle');
  const [accessibility, setAccessibility] = useState(false);
  const [systemAudio, setSystemAudio] = useState<'idle' | 'working' | 'allowed' | 'failed'>('idle');
  const record = (name: Settings['onboardingPermissions'][number]['name'], clicked: boolean, granted: boolean) => {
    const existing = s.onboardingPermissions.filter((item) => item.name !== name);
    void patch({ onboardingPermissions: [...existing, { name, clicked, granted }] });
  };
  const requestMic = async () => {
    setMicState('working');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicState('allowed');
      record('microphone', true, true);
    } catch {
      setMicState('failed');
      record('microphone', true, false);
    }
  };
  const allowAccessibility = () => { setAccessibility(true); record('accessibility', true, true); };
  const requestSystem = async () => {
    setSystemAudio('working'); record('system_audio', true, false); record('screen_capture', true, false);
    try { const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }); stream.getTracks().forEach((t) => t.stop()); setSystemAudio('allowed'); record('system_audio', true, true); record('screen_capture', true, true); } catch { setSystemAudio('failed'); }
  };
  const ready = micState === 'allowed' && accessibility;
  return <StepLayout preview={<div className={styles.permissionArt}><Lock/><div className={styles.orbit}><Mic/><Keyboard/><MonitorUp/></div><h2>{ready ? 'Thanks for trusting us' : 'Your data stays yours'}</h2><p>{ready ? 'We value your privacy. You can change access in Windows Settings.' : 'Murmur only listens while you actively dictate or record.'}</p></div>}>
    <Eyebrow>PERMISSIONS</Eyebrow><h1>Give Murmur permissions on your computer</h1><p>These permissions let Murmur hear you and place words into the right textbox.</p>
    <PermissionCard icon={<Mic/>} title="Microphone" body="Used only while dictating or recording a meeting." state={micState} action={requestMic}/>
    {micState === 'failed' && <div className={styles.permissionError}>Permission verification failed or timed out. Close apps using the mic, then retry. Windows privacy may also be blocking access. <button onClick={() => void api.app.openExternal('ms-settings:privacy-microphone')}>Open microphone privacy settings</button></div>}
    <PermissionCard icon={<Keyboard/>} title="Accessibility" body="On Windows, Murmur uses UI Automation to paste into the focused app; no icon drag is needed." state={accessibility ? 'allowed' : 'idle'} action={allowAccessibility}/>
    <PermissionCard icon={<Keyboard/>} title="Notetaker accessibility" body="Recognize supported meeting windows and start when they begin." state={accessibility ? 'allowed' : 'idle'} action={allowAccessibility}/>
    <PermissionCard icon={<Mic/>} title="Notetaker microphone" body="Capture your voice only while Notetaker is active." successText="Ready for meeting capture." state={micState} action={requestMic}/>
    <PermissionCard icon={<MonitorUp/>} title="System audio" body="Capture other participants while Notetaker is active." state={systemAudio} action={requestSystem}/>
    <PermissionCard icon={<MonitorUp/>} title="Screen capture" body="Optionally capture visible context for questions; Windows will show its picker." state={systemAudio} action={requestSystem}/>
    {!ready && <div className={styles.permissionError}>Not all required permissions are granted. Allow microphone and accessibility before continuing.</div>}
    <Footer><Button disabled={!ready} onClick={next}>{systemAudio === 'allowed' ? 'Continue' : 'Continue without system audio'}</Button></Footer>
  </StepLayout>;
}

function PermissionCard({ icon, title, body, successText, state, action }: { icon: ReactNode; title: string; body: string; successText?: string; state: 'idle' | 'working' | 'allowed' | 'failed'; action: () => void }) {
  return <div className={styles.permissionCard}><span>{icon}</span><div><strong>{title}</strong><p>{state === 'allowed' ? successText ?? `${title} is ready.` : body}</p></div>{state === 'allowed' ? <Check className={styles.success}/> : <Button variant="outline" loading={state === 'working'} onClick={action}>{state === 'failed' ? 'Try again' : 'Allow'}</Button>}</div>;
}

function SetupStep({ substep, next }: { substep: number; next: () => void }) {
  const s = useSettings();
  const patch = usePatchSettings();
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState(false);
  const [shortcutPressed, setShortcutPressed] = useState(false);
  const [providerStatus, setProviderStatus] = useState('');
  const [asrStatus, setAsrStatus] = useState('');
  useEffect(() => {
    if (substep !== 0) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let context: AudioContext | null = null;
    void navigator.mediaDevices.getUserMedia({ audio: true }).then((media) => {
      stream = media; context = new AudioContext();
      const analyser = context.createAnalyser(); context.createMediaStreamSource(media).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const draw = () => { analyser.getByteTimeDomainData(data); const rms = Math.sqrt(data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length); setLevel(Math.min(1, rms * 8)); frame = requestAnimationFrame(draw); }; draw();
    }).catch(() => setMicError(true));
    return () => { cancelAnimationFrame(frame); stream?.getTracks().forEach((t) => t.stop()); void context?.close(); };
  }, [substep]);
  useEffect(() => {
    if (substep !== 2) return;
    const onKey = (event: KeyboardEvent) => { if (event.ctrlKey || event.metaKey || event.key === 'CapsLock') setShortcutPressed(true); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [substep]);
  useEvent('dictation:state', (state) => { if (substep === 2 && state.phase !== 'resting' && state.phase !== 'hidden') setShortcutPressed(true); });
  useEffect(() => { if (substep === 3) void api.engines.asrStatus().then((r) => setAsrStatus(r.ready ? `${r.model} is ready` : r.error ?? `${r.model} will be prepared on first use`)); }, [substep]);
  const steps = [
    <div key="mic"><Eyebrow>MICROPHONE TEST</Eyebrow><h1>Speak to continue</h1><p>Talk normally and make sure the purple bars move.</p><div className={styles.bars}>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ height: `${12 + Math.max(level * 52 - Math.abs(i - 9) * 3, 0)}px` }}/>)}</div>{micError && <div className={styles.permissionError}><strong>Microphone may be busy.</strong> Close Zoom, Teams, Meet, Discord, FaceTime, or another app using it, then choose another input. <button onClick={() => void api.app.openExternal('ms-settings:sound')}>Open Sound Settings</button></div>}{s.micDeviceId !== 'default' && <p className={styles.hint}>If your selected microphone is disconnected, change the mic in Settings or reconnect it.</p>}{!micError && level < .02 && <p className={styles.hint}>We can’t hear you. Try changing your mic.</p>}</div>,
    <div key="language"><Eyebrow>LANGUAGE</Eyebrow><h1>What languages do you speak?</h1><p>Murmur can mix languages in one sentence with a multilingual model.</p><div className={styles.setupList}><Checkbox label="Auto-detect language" checked={s.autoDetectLanguage} onChange={(autoDetectLanguage) => void patch({ autoDetectLanguage })}/>{[['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['hi', 'Hindi'], ['ja', 'Japanese']].map(([code, label]) => <Checkbox key={code} label={label} checked={s.languages.includes(code)} onChange={(active) => void patch({ languages: active ? [...s.languages, code] : s.languages.filter((x) => x !== code) })}/>)}</div></div>,
    <div key="shortcut"><Eyebrow>YOUR SHORTCUT</Eyebrow><h1>Try your dictation shortcut</h1><p>Hold the shortcut, speak, then release. The keys turn purple when Murmur sees them.</p><div className={styles.bigKeys}>{s.shortcuts.ptt[0]?.split('+').map((key) => <Kbd key={key} combo={key} active={shortcutPressed}/>)}</div><div className={styles.setupActions}><Button variant="outline" onClick={() => void api.settings.recordShortcut().then((combo) => api.settings.setShortcut('ptt', [combo]))}>Change shortcut</Button><Button variant="ghost" onClick={() => void api.settings.setShortcut('ptt', ['CapsLock'])}>Use Caps Lock</Button></div>{s.shortcuts.ptt.includes('CapsLock') && <p className={styles.hint}>Caps Lock now starts dictation instead of typing uppercase. You can change this later in Settings.</p>}{shortcutPressed && <div className={styles.successMessage}><Check/> Shortcut detected</div>}</div>,
    <div key="engines"><Eyebrow>AI, SPEECH &amp; NOTETAKER</Eyebrow><h1>Finish your local setup</h1><p>Claude and Codex use command-line tools already signed in on your computer.</p><Segmented value={s.llm.provider} options={[{ value: 'claude', label: 'Claude' }, { value: 'codex', label: 'Codex' }, { value: 'none', label: 'None' }]} onChange={(provider) => { void patch({ llm: { ...s.llm, provider } }); setProviderStatus(''); }}/><div className={styles.engineStatus}>{asrStatus || 'Checking speech model…'}</div><Button variant="outline" disabled={s.llm.provider === 'none'} onClick={() => { setProviderStatus('Testing…'); void api.engines.testLlm(s.llm.provider).then((r) => setProviderStatus(`${r.ok ? 'Ready' : 'Unavailable'} · ${r.ms}ms · ${r.output}`)); }}>Test AI provider</Button>{providerStatus && <p>{providerStatus}</p>}<h2>Start Notetaker automatically?</h2><p>Murmur can start after a short countdown when it detects a meeting.</p><Segmented value={s.notetaker.autoStart ? 'yes' : 'not_now'} options={[{ value: 'yes', label: 'Yes' }, { value: 'not_now', label: 'Not now' }]} onChange={(value) => void patch({ notetaker: { ...s.notetaker, autoStart: value === 'yes', autoStartOptInState: value === 'yes' ? 'enabled' : 'disabled' } })}/><p className={styles.notice}>Outlook and iCloud account connections are not supported offline. Notetaker still works manually and .ics calendars can provide reminders.</p></div>,
  ];
  return <StepLayout preview={<div className={styles.setupPreview}><div className={styles.soundOrb}><Mic/></div><h2>Private speech, processed locally</h2><p>Your microphone audio is transcribed by Whisper on this computer.</p></div>}>{steps[substep]}<Footer><Button disabled={substep === 1 && !s.autoDetectLanguage && s.languages.length === 0} onClick={next}>Continue</Button></Footer></StepLayout>;
}

function LearnStep({ next }: { next: () => void }) {
  const s = useSettings();
  const patch = usePatchSettings();
  const [tab, setTab] = useState<'slack' | 'email' | 'notes'>('slack');
  const [text, setText] = useState('');
  const [minutes, setMinutes] = useState(s.profile.typingMinutesPerDay);
  const [skipGuard, setSkipGuard] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEvent('dictation:state', (state) => { if (state.phase === 'active_ptt' || state.phase === 'active_popo') ref.current?.focus(); });
  const saved = Math.round(minutes * 5 * .7 / 60 * 10) / 10;
  return <StepLayout preview={<div><div className={styles.demo}><div className={styles.demoCursor}/><p>Go try Murmur in another app</p><span>Open any app, click a textbox, then hold your shortcut and speak.</span></div><div className={styles.practice}><div className={styles.practiceTabs}>{(['slack', 'email', 'notes'] as const).map((item) => <button className={tab === item ? styles.activeTab : ''} key={item} onClick={() => setTab(item)}>{item === 'slack' ? 'Messenger / Slack' : item === 'email' ? 'Email' : 'Notion / list'}</button>)}</div><textarea ref={ref} aria-label="Practice dictation" value={text} placeholder={tab === 'slack' ? 'Message #team…' : tab === 'email' ? 'Write an email…' : 'Create a role-tailored list…'} onChange={(e) => setText(e.target.value)}/>{text.trim().length > 8 && <div className={styles.sticker}><Check/> {tab === 'notes' ? 'List created!' : 'You did it!'}</div>}</div></div>}>
    <Eyebrow>TRY IT YOURSELF</Eyebrow><h1>Talk instead of type</h1><p>Click the practice textbox, hold <Kbd combo={s.shortcuts.ptt[0] ?? 'your shortcut'}/>, speak, then release. This is a real textbox, so the dictation pipeline can paste directly into it.</p><div className={styles.tip}><Keyboard/><div><strong>Hold for a quick dictation</strong><p>Don’t tap. Hold the shortcut while you talk, then release. Double-tap starts hands-free mode.</p></div></div>{skipGuard && <div className={styles.permissionError}><strong>People who watch this demo get 2× the value from Murmur.</strong><div className={styles.setupActions}><Button variant="ghost" onClick={() => setSkipGuard(false)}>Keep watching</Button><Button variant="outline" onClick={next}>Yes, skip</Button></div></div>}<h2>How much time do you type each day?</h2><label className={styles.savings}><input type="range" min={15} max={240} step={15} value={minutes} onChange={(e) => { const value = Number(e.target.value); setMinutes(value); void patch({ profile: { ...s.profile, typingMinutesPerDay: value } }); }}/><span>{minutes} min/day</span></label><strong>You could save about {saved} hours each week.</strong><Footer><Button variant="ghost" onClick={() => setSkipGuard(true)}>Skip demo</Button><Button disabled={text.trim().length < 3} onClick={next}>Continue</Button></Footer>
  </StepLayout>;
}

const CONTEXTS: { id: StyleContext; label: string; sample: string }[] = [
  { id: 'work', label: 'Work messages', sample: 'hey team the new build is ready can you review it today' },
  { id: 'email', label: 'Emails', sample: 'hi sam thanks for meeting today ill send the proposal tomorrow best alex' },
  { id: 'personal', label: 'Personal messages', sample: 'that sounds great see you around seven' },
  { id: 'other', label: 'Other', sample: 'here are the main ideas from todays planning session' },
];
const TONES: { id: StyleTone; label: string }[] = [{ id: 'formal', label: 'Formal' }, { id: 'casual', label: 'Casual' }, { id: 'excited', label: 'Excited' }];

function PersonalizeStep() {
  const s = useSettings();
  const patch = usePatchSettings();
  const [context, setContext] = useState<StyleContext>('work');
  const selected = CONTEXTS.find((x) => x.id === context) ?? CONTEXTS[0];
  const finish = async (complete: boolean) => { await patch({ personalizationComplete: complete, postOnboardingCompleted: true }); await api.app.completeOnboarding(); };
  const skipCategory = () => {
    const index = CONTEXTS.findIndex((item) => item.id === context);
    setContext(CONTEXTS[(index + 1) % CONTEXTS.length].id);
  };
  return <StepLayout preview={<div className={styles.tonePreview}><span>{selected.label}</span><p>{applyTone(ensureTerminalPunctuation(capitalize(selected.sample)), s.styles[context].tone)}</p></div>}>
    <Eyebrow>PERSONALIZE</Eyebrow><h1>Make every message sound like you</h1><p>Choose a tone for each context. Murmur applies capitalization, punctuation, and formatting automatically.</p><div className={styles.contextTabs}>{CONTEXTS.map((item) => <button className={context === item.id ? styles.selected : ''} key={item.id} onClick={() => setContext(item.id)}>{item.label}</button>)}</div><div className={styles.toneChoices}>{TONES.map((tone) => <button className={s.styles[context].tone === tone.id ? styles.selected : ''} key={tone.id} onClick={() => void patch({ styles: { [context]: { ...s.styles[context], tone: tone.id } } })}><strong>{tone.label}</strong><p>{applyTone(ensureTerminalPunctuation(capitalize(selected.sample)), tone.id)}</p></button>)}</div><Footer><Button variant="ghost" onClick={skipCategory}>Skip {selected.label}</Button><Button variant="ghost" onClick={() => void finish(false)}>Set up later</Button><Button onClick={() => void finish(true)}>Finish setup</Button></Footer>
  </StepLayout>;
}

function Eyebrow({ children }: { children: ReactNode }) { return <div className={styles.eyebrow}>{children}</div>; }
function Footer({ children }: { children: ReactNode }) { return <div className={styles.footer}>{children}</div>; }
function StepLayout({ children, preview }: { children: ReactNode; preview: ReactNode }) { return <div className={styles.columns}><main className={styles.form}>{children}</main><aside className={styles.preview}>{preview}</aside></div>; }

export function Onboarding() {
  const settings = useSettings();
  const patch = usePatchSettings();
  const initialStage = STAGES.some((x) => x.id === settings.onboardingStep) ? settings.onboardingStep as Stage : 'signup';
  const [stage, setStage] = useState<Stage>(initialStage);
  const [substep, setSubstep] = useState(0);
  const [showNudge, setShowNudge] = useState(initialStage !== 'signup' || settings.onboardingPagesCompleted.length > 0);
  const stageIndex = STAGES.findIndex((x) => x.id === stage);
  const signupLast = settings.profile.intents.includes('notetaker') ? 5 : 4;
  const maxSubstep = stage === 'signup' ? signupLast : stage === 'setup' ? 3 : 0;
  const goStage = (nextStage: Stage) => { setStage(nextStage); setSubstep(0); void patch({ onboardingStep: nextStage }); };
  const next = () => {
    const page = `${stage}-${substep}`;
    void patch({ onboardingPagesCompleted: [...settings.onboardingPagesCompleted.filter((item) => item.page !== page), { page, completed: true }] });
    if (substep < maxSubstep) setSubstep((x) => x + 1);
    else if (stageIndex < STAGES.length - 1) goStage(STAGES[stageIndex + 1].id);
  };
  const back = () => { if (substep > 0) setSubstep((x) => x - 1); else if (stageIndex > 0) goStage(STAGES[stageIndex - 1].id); };
  const body = stage === 'signup' ? <SignupStep substep={substep} next={next}/> : stage === 'permissions' ? <PermissionsStep next={next}/> : stage === 'setup' ? <SetupStep substep={substep} next={next}/> : stage === 'learn' ? <LearnStep next={next}/> : <PersonalizeStep/>;
  return <div className={styles.root}><header className={styles.rail}><div className={styles.wordmark}><Logo size={20}/></div><nav aria-label="Onboarding progress">{STAGES.map((item, index) => <span key={item.id} className={index <= stageIndex ? styles.current : ''}>{index < stageIndex ? <Check size={14}/> : null}{item.label}{index < STAGES.length - 1 && <b>›</b>}</span>)}</nav>{(stageIndex > 0 || substep > 0) ? <button aria-label="Back" className={styles.back} onClick={back}><ChevronLeft/> Back</button> : <span/>}</header>{showNudge && <div className={styles.nudge} role="status"><div><strong>Just a few more steps!</strong><span>Return to Murmur and finish onboarding.</span></div><Button size="sm" onClick={() => setShowNudge(false)}>Finish onboarding</Button></div>}{body}</div>;
}
