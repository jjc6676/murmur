import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Plus, RotateCcw, Sparkles, ThumbsDown, ThumbsUp, Trash2, Undo2 } from 'lucide-react';
import { BUILT_IN_TRANSFORMS, POLISH_RULES } from '@shared/settings';
import type { TransformDef, TransformRun } from '@shared/types';
import { countWords } from '@shared/textPipeline';
import { validateCombo } from '@shared/hotkeys';
import { api, errorMessage } from '../../lib/api';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { toast, useHubUi } from '../state';
import { Badge, Banner, Button, Checkbox, ConfirmDialog, Dialog, Field, IconButton, Input, Kbd, Page, PageHeader, Select, TextArea, Toggle } from '../../ui';
import styles from './transforms.module.css';

export function TransformExperience() {
  const settings = useSettings();
  const patch = usePatchSettings();
  const [editor, setEditor] = useState<TransformDef | 'new' | null>(null);
  const [how, setHow] = useState(false);
  const [tryOpen, setTryOpen] = useState(false);
  const [reset, setReset] = useState(false);
  async function resetDefaults() { await api.transforms.resetDefaults(); toast('Transforms reset to defaults', { tone: 'success' }); }
  async function setEnabled(enabled: boolean) {
    if (enabled) {
      await patch({ transformsEnabled: true });
      return;
    }
    const defaults = new Map(BUILT_IN_TRANSFORMS.map((transform) => [transform.id, transform.shortcut]));
    await patch({
      transformsEnabled: false,
      transforms: settings.transforms.map((transform) => ({ ...transform, shortcut: defaults.get(transform.id) ?? null })),
    });
  }
  return <Page wide>
    <PageHeader title="Transforms" badge={<Badge tone="dark">Beta</Badge>} actions={<div className={styles.headerControls}><span>Opt in</span><Toggle label="Opt in to Transforms" checked={settings.transformsEnabled} onChange={(checked) => void setEnabled(checked)} /><div className={styles.shortcutPill}><Kbd combo={settings.shortcuts.viewDiff[0] || 'Win+Alt+O'} /> <span>to view changes</span></div></div>} />
    <div className={styles.hero}><Banner variant="teal" art={<div className={styles.heroArt} />} title="Transform works anywhere you write" body="Apply a Transform to rewrite, clean up, or restructure text after you dictate." actions={<><Button variant="light" onClick={() => setTryOpen(true)}>Try it out</Button><Button variant="ghost" onClick={() => setHow(true)}>How it works</Button></>} /></div>
    <div className={styles.autoRow}><div><strong>Auto Apply After Dictation</strong><div className="m-field__hint">Run a transform on everything you dictate, automatically.</div></div><div className={styles.autoControls}><Select ariaLabel="Auto apply transform" disabled={!settings.autoApplyAfterDictation.active} value={settings.autoApplyAfterDictation.transformId} options={settings.transforms.map((t) => ({ value: t.id, label: t.name }))} onChange={(transformId) => void patch({ autoApplyAfterDictation: { transformId } })} /><Toggle label="Auto Apply After Dictation" checked={settings.autoApplyAfterDictation.active} onChange={(active) => void patch({ autoApplyAfterDictation: { active } })} /></div></div>
    <div className={styles.sectionHead}><h2>My Transforms</h2><div><Button variant="ghost" icon={<RotateCcw size={16} />} onClick={() => setReset(true)}>Reset to defaults</Button><Button onClick={() => setEditor('new')}>Create New</Button></div></div>
    <div className={styles.cards}>{settings.transforms.map((transform) => <button className={styles.card} key={transform.id} onClick={() => setEditor(transform)}>{transform.shortcut ? <Kbd combo={transform.shortcut} /> : <span className={styles.plus}><Sparkles size={15} /></span>}<h3>{transform.name}</h3><p>{transform.description}</p></button>)}<button className={styles.card} onClick={() => setEditor('new')}><span className={styles.plus}><Plus size={16} /></span><h3>Create your own</h3><p>Upload your own prompt</p></button></div>
    {tryOpen && <TryPanel onClose={() => setTryOpen(false)} />}
    <TransformEditor value={editor} onClose={() => setEditor(null)} />
    <Dialog open={how} onClose={() => setHow(false)} title="How Transforms work"><div className={styles.howSteps}><div className={styles.howStep}><span className={styles.stepNo}>1</span><div><strong>Highlight your text</strong><p>Select anything you want to rewrite in any app.</p></div></div><div className={styles.howStep}><span className={styles.stepNo}>2</span><div><strong>Press the shortcut</strong><p>Use the shortcut on a Transform card. Murmur replaces the selection.</p></div></div><div className={styles.howStep}><span className={styles.stepNo}>3</span><div><strong>Review changes</strong><p>Open the changes view to compare and copy the result.</p></div></div></div></Dialog>
    <ConfirmDialog open={reset} title="Reset transforms to defaults?" body="This removes all custom transforms and restores Polish and Prompt Engineer." confirmLabel="Reset to defaults" danger onClose={() => setReset(false)} onConfirm={() => void resetDefaults()} />
  </Page>;
}

function TransformEditor({ value, onClose }: { value: TransformDef | 'new' | null; onClose: () => void }) {
  const settings = useSettings();
  const patch = usePatchSettings();
  const existing = value && value !== 'new' ? value : null;
  const [name, setName] = useState(''); const [prompt, setPrompt] = useState(''); const [description, setDescription] = useState('');
  const [shortcut, setShortcut] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (value) { setName(existing?.name ?? ''); setPrompt(existing?.prompt ?? ''); setDescription(existing?.description ?? ''); setShortcut(existing?.shortcut ?? null); setError(null); } }, [existing, value]);
  async function record() {
    try { const combo = await api.settings.recordShortcut(); const all = { ...settings.shortcuts, ...Object.fromEntries(settings.transforms.map((t) => [t.id, t.shortcut ? [t.shortcut] : []])) }; const invalid = validateCombo(combo, existing?.id ?? 'new-transform', all); if (invalid) setError(invalid); else { setShortcut(combo); setError(null); } } catch (cause) { setError(errorMessage(cause)); }
  }
  async function save() {
    if (!name.trim()) { setError('Name is required'); return; } if (!prompt.trim()) { setError('Transformation prompt is required'); return; }
    const transform: TransformDef = existing ? { ...existing, name: name.trim(), description: description.trim() || 'Custom transform', prompt: prompt.trim(), shortcut } : { id: crypto.randomUUID(), name: name.trim(), description: description.trim() || 'Custom transform', prompt: prompt.trim(), shortcut, builtIn: false };
    await patch({ transforms: existing ? settings.transforms.map((t) => t.id === existing.id ? transform : t) : [...settings.transforms, transform] }); onClose();
  }
  if (existing?.id === 'polish') return <PolishEditor value={existing} onClose={onClose} />;
  return <Dialog open={!!value} onClose={onClose} title={existing ? `Edit ${existing.name}` : 'Create New'} description="Describe exactly how Murmur should transform selected text." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void save()}>Save transform</Button></>}><div className={styles.dialogFields}><Field label="Name"><Input aria-label="Transform name" placeholder="Boss Mode" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Description"><Input aria-label="Description" placeholder="Makes updates concise and decisive" value={description} onChange={(e) => setDescription(e.target.value)} /></Field><Field label="Transformation prompt" error={error}><TextArea aria-label="Transformation prompt" rows={6} placeholder="Rewrite this like a clear, decisive leader..." value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field><Field label="Keyboard shortcut"><div className={styles.shortcutRecorder}>{shortcut && <Kbd combo={shortcut} />}<Button variant="outline" onClick={() => void record()}>{shortcut ? 'Change shortcut' : 'Choose a keyboard shortcut'}</Button></div></Field></div></Dialog>;
}

function PolishEditor({ value, onClose }: { value: TransformDef; onClose: () => void }) {
  const settings = useSettings(); const patch = usePatchSettings();
  const [rules, setRules] = useState(value.rules ?? POLISH_RULES.map((rule) => ({ ...rule, custom: false })));
  const [custom, setCustom] = useState(''); const [error, setError] = useState<string | null>(null); const [sample, setSample] = useState('');
  function addRule() { const label = custom.trim(); if (!label) return; if (rules.some((r) => r.label.toLowerCase() === label.toLowerCase())) { setError('That rule already exists'); return; } setRules([...rules, { id: crypto.randomUUID(), label, enabled: true, custom: true }]); setCustom(''); setError(null); }
  function addSample() { const words = countWords(sample); if (words < 50) { setError('Writing samples must contain at least 50 words'); return; } if (words > 2000) { setError('Writing samples cannot exceed 2,000 words'); return; } void patch({ writingSamples: [...settings.writingSamples, sample.trim()] }); setSample(''); setError(null); }
  async function save() { await patch({ transforms: settings.transforms.map((t) => t.id === value.id ? { ...t, rules } : t) }); onClose(); }
  return <Dialog open onClose={onClose} width={620} title="Edit Polish" description="Choose rules and provide examples of your writing voice." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void save()}>Save changes</Button></>}><div className={styles.dialogFields}><Field label="Polish rules"><div className={styles.ruleList}>{rules.map((rule) => <div className={styles.rule} key={rule.id}><Checkbox label={rule.label} checked={rule.enabled} onChange={(enabled) => setRules(rules.map((r) => r.id === rule.id ? { ...r, enabled } : r))} />{rule.custom && <IconButton label={`Delete ${rule.label}`} onClick={() => setRules(rules.filter((r) => r.id !== rule.id))}><Trash2 size={15} /></IconButton>}</div>)}</div></Field><Field label="Custom rule" error={error}><div className={styles.addRule}><Input aria-label="Custom rule" value={custom} onChange={(e) => setCustom(e.target.value)} /><Button variant="outline" onClick={addRule}>Add rule</Button></div></Field><Field label="Writing samples" hint="Each sample must contain 50–2,000 words."><TextArea aria-label="Writing sample" rows={5} value={sample} onChange={(e) => setSample(e.target.value)} /><div className={styles.counter}>{countWords(sample)} / 2,000 words</div><Button variant="outline" disabled={!sample.trim()} onClick={addSample}>Add writing sample</Button></Field><div className={styles.samples}>{settings.writingSamples.map((text, i) => <div className={styles.sample} key={`${i}-${text.slice(0, 10)}`}>{text}<IconButton label="Remove writing sample" onClick={() => void patch({ writingSamples: settings.writingSamples.filter((_, n) => n !== i) })}><Trash2 size={14} /></IconButton></div>)}</div></div></Dialog>;
}

function TryPanel({ onClose }: { onClose: () => void }) {
  const settings = useSettings(); const patch = usePatchSettings(); const showDiff = useHubUi((state) => state.showDiff);
  const [text, setText] = useState(''); const [transformId, setTransformId] = useState(settings.transforms[0]?.id ?? 'polish'); const [run, setRun] = useState<TransformRun | null>(null); const [history, setHistory] = useState<TransformRun[]>([]); const [running, setRunning] = useState(false); const [error, setError] = useState<string | null>(null); const sampleInput = useRef<HTMLInputElement>(null);
  useEffect(() => { void api.transforms.history(8).then(setHistory); }, [run]);
  async function execute() { if (!text.trim()) { setError('Enter text to transform'); return; } setRunning(true); setError(null); try { const result = await api.transforms.run(transformId, text); setRun(result); if (result.error) setError(result.error); } catch (cause) { setError(errorMessage(cause)); } finally { setRunning(false); } }
  const selected = settings.transforms.find((t) => t.id === transformId);
  return <div className={styles.tryPanel}><div className={styles.sectionHead}><h2>Try it out</h2><Button variant="ghost" onClick={onClose}>Close</Button></div><div className={styles.tryControls}><Field label="Text to transform" error={error}><TextArea aria-label="Text to transform" rows={5} placeholder="Try ‘Make me sound like a CEO’ or select a prompt" value={text} onChange={(e) => setText(e.target.value)} /></Field><div className={styles.tryButtons}><Select ariaLabel="Transform picker" value={transformId} options={settings.transforms.map((t) => ({ value: t.id, label: t.name }))} onChange={setTransformId} /><Button loading={running} onClick={() => void execute()}>Run</Button><Button variant="outline" onClick={() => sampleInput.current?.click()}>Upload writing example</Button><input ref={sampleInput} className={styles.fileInput} type="file" accept=".txt,.md,text/plain,text/markdown" aria-label="Writing example file" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((sample) => { const words = countWords(sample); if (words < 50) { setError('Writing examples must contain at least 50 words'); return; } if (words > 2000) { setError('Writing examples cannot exceed 2,000 words'); return; } void patch({ writingSamples: [...settings.writingSamples, sample.trim()] }); toast('Writing example added', { body: `${words} words`, tone: 'success' }); setError(null); }); event.currentTarget.value = ''; }} /></div></div>{run?.outputText && <><div className={styles.resultGrid}><div className={styles.result}><b>Original</b>{run.inputText}</div><div className={styles.result}><b>{selected?.name ?? 'Result'}</b>{run.outputText}</div></div><div className={styles.resultActions}><Button variant="outline" onClick={() => showDiff({ before: run.inputText, after: run.outputText, title: `${selected?.name ?? 'Transform'} changes` })}>See changes</Button><Button variant="outline" icon={<Copy size={14} />} onClick={() => void api.app.copyText(run.outputText).then(() => toast('Result copied', { tone: 'success' }))}>Copy</Button><Button variant="outline" icon={<ThumbsUp size={14} />} onClick={() => toast('Thanks for the feedback', { tone: 'success' })}>Good result</Button><Button variant="outline" icon={<ThumbsDown size={14} />} onClick={() => toast('Feedback saved locally', { tone: 'info' })}>Bad result</Button><Button variant="outline" icon={<Undo2 size={14} />} onClick={() => { setText(run.inputText); setRun(null); }}>Undo</Button><Button variant="outline" onClick={() => void execute()}>Retry</Button><Button onClick={() => { setText(run.outputText); setRun(null); toast('Edits accepted', { tone: 'success' }); }}>Accept edits</Button></div></>}<div className={styles.history}><h3>Transform history</h3>{history.length ? history.map((item) => <div className={styles.historyRow} key={item.id}><span>{settings.transforms.find((t) => t.id === item.transformId)?.name ?? item.transformId}</span><span className={styles.historyText}>{item.outputText || item.error}</span><span>{item.status === 'success' ? <Check size={15} /> : item.status}</span></div>) : <p className="m-field__hint">No transforms run yet.</p>}</div></div>;
}
