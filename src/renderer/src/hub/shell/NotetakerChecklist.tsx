import { useState } from 'react';
import { CalendarDays, Check, ChevronRight, Import, PlayCircle, Server, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { Button, ConfirmDialog, Dialog, IconButton, Progress } from '../../ui';
import { toast, useHubUi } from '../state';
import '../notetaker/notetaker.css';

const ITEMS = [
  { id: 'tour', label: 'Take 2-min tour', icon: PlayCircle },
  { id: 'calendar', label: 'Connect calendar', icon: CalendarDays },
  { id: 'import', label: 'Import your past meetings', icon: Import },
  { id: 'mcp', label: 'Set up MCP', icon: Server },
] as const;

export function NotetakerChecklist() {
  const settings = useSettings();
  const patch = usePatchSettings();
  const openSettings = useHubUi((state) => state.openSettings);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [skip, setSkip] = useState<(typeof ITEMS)[number] | null>(null);
  const prefix = 'notetaker-checklist:';
  const done = ITEMS.filter((item) => settings.dismissedBanners.includes(prefix + item.id));

  const complete = async (id: string) => {
    if (settings.dismissedBanners.includes(prefix + id)) return;
    await patch({ dismissedBanners: [...settings.dismissedBanners, prefix + id] });
  };

  const run = async (id: (typeof ITEMS)[number]['id']) => {
    if (id === 'tour') {
      setTourStep(0);
      return;
    }
    if (id === 'calendar') openSettings('connectors');
    if (id === 'mcp') openSettings('mcp');
    if (id === 'import') {
      const path = await api.app.pickFile([{ name: 'Meetings', extensions: ['wav', 'mp3', 'm4a', 'txt', 'vtt', 'srt'] }]);
      if (!path) return;
      try {
        await api.meetings.importFiles([path]);
        toast('Meeting imported', { tone: 'success' });
      } catch (error) {
        toast(errorMessage(error), { tone: 'error' });
        return;
      }
    }
    await complete(id);
  };

  if (done.length === ITEMS.length) return <div className="checklist"><div className="checklist-head">All set!</div><span className="nt-subtle">Notetaker is ready for your next meeting.</span></div>;
  const steps = [
    ['Start a meeting', 'Use Start Notetaker from anywhere to capture your conversation.'],
    ['Stay present', 'Murmur builds a live transcript while you add private thoughts.'],
    ['Get a clear summary', 'Stop when you finish and Murmur turns the conversation into decisions and next steps.'],
    ['Keep moving', 'Ask questions, add action items to My Tasks, and organize notes in folders.'],
  ];

  return (
    <>
      <div className="checklist">
        <div className="checklist-head">Set up Notetaker</div>
        <Progress value={done.length / ITEMS.length} />
        {ITEMS.map((item) => {
          const completed = done.some((entry) => entry.id === item.id);
          const Icon = item.icon;
          return (
            <div key={item.id} className="checklist-item">
              <button type="button" className="checklist-item nt-grow" disabled={completed} onClick={() => void run(item.id)}>
                {completed ? <Check size={18} /> : <Icon size={18} />}<span>{item.label}</span>
              </button>
              {!completed && <IconButton className="checklist-skip" size="sm" label={`Skip ${item.label}`} onClick={() => setSkip(item)}><X size={14} /></IconButton>}
            </div>
          );
        })}
      </div>
      <ConfirmDialog open={skip !== null} title="Are you sure?" body={skip?.id === 'mcp' ? 'MCP lets AI tools search your local notes, answer questions, and take actions from calls. You can still set it up later in Notetaker settings.' : `You can still ${skip?.label.toLowerCase()} later from Notetaker settings.`} confirmLabel="Skip for now" onClose={() => setSkip(null)} onConfirm={() => { if (skip) void complete(skip.id); setSkip(null); }} />
      <Dialog
        open={tourStep !== null}
        onClose={() => setTourStep(null)}
        title={tourStep === null ? '' : steps[tourStep][0]}
        description={tourStep === null ? '' : steps[tourStep][1]}
        footer={tourStep !== null && <>
          <Button variant="ghost" onClick={() => setTourStep(null)}>Exit tour</Button>
          <Button icon={<ChevronRight size={16} />} onClick={() => {
            if (tourStep === steps.length - 1) {
              void complete('tour');
              setTourStep(null);
            } else setTourStep(tourStep + 1);
          }}>{tourStep === steps.length - 1 ? 'Finish' : 'Next'}</Button>
        </>}
      >
        {tourStep !== null && <div className="tour-step"><PlayCircle size={54} /><strong>Step {tourStep + 1} of {steps.length}</strong></div>}
      </Dialog>
    </>
  );
}
