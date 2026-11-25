// Events broadcast from main to renderer windows.
import type { Settings } from './settings';
import type { DictationState, MemoryStatus, RecorderState, Toast, TranscriptSegment } from './types';

export interface MurmurEvents {
  'settings:changed': Settings;
  'dictation:state': DictationState;
  'history:changed': { id: string | null };
  'dictionary:changed': null;
  'notes:changed': { id: string | null };
  'todos:changed': null;
  'meetings:changed': { id: string | null };
  'meetings:importProgress': { current: number; total: number; done: boolean };
  'recorder:state': RecorderState;
  'recorder:segment': TranscriptSegment;
  'notifications:changed': null;
  'memory:status': MemoryStatus;
  'toast:show': Toast;
  'toast:hide': { id: string };
  'asr:download': { id: string; received: number; total: number; done: boolean; error: string | null };
  'asr:status': { ready: boolean; model: string; error: string | null };
  'hub:navigate': { route: string };
  'settings:open': { section: string | null };
  'scratchpad:open': { noteId: string | null };
  'notepad:open': { meetingId: string | null };
  /** Main asks the capture window to start/stop mic (dictation) or mic+system (meeting) capture. */
  'capture:command': { kind: 'dictation' | 'meeting'; action: 'start' | 'stop' | 'pause' | 'resume'; deviceId: string };
  'diff:show': { before: string; after: string; title: string };
  'sound:play': { name: 'start' | 'stop' | 'paste' | 'notification' | 'achievement' };
  /** Main's cursor hit test says the pointer is over (or left) the Flow Bar's controls. */
  'status:hover': { inside: boolean };
}
