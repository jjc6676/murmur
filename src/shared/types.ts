// Domain types shared across processes. Persisted rows use ISO strings for dates (ms epoch where noted).

export type Theme = 'light' | 'dark' | 'system';
export type CleanupLevel = 'none' | 'light' | 'medium' | 'high';
export type StyleContext = 'work' | 'email' | 'personal' | 'other';
export type StyleTone = 'formal' | 'casual' | 'very_casual' | 'excited' | 'gen_z';
export type LlmProvider = 'claude' | 'codex' | 'none';
export type DictationMode = 'ptt' | 'popo' | 'command' | 'lens' | 'instruct';

// ---------------------------------------------------------------- dictation
export type DictationPhase =
  | 'hidden'
  | 'resting'
  | 'initializing'
  | 'active_ptt'
  | 'active_popo'
  | 'processing'
  | 'polish_processing'
  | 'completed'
  | 'error';

export interface DictationState {
  phase: DictationPhase;
  mode: DictationMode | null;
  startedAt: number | null; // ms epoch
  level: number; // 0..1 mic RMS
  message: string | null; // transient label ("Cleaned up!", errors)
  lastEntryId: string | null;
  polishName: string | null;
}

export type HistoryStatus = 'success' | 'empty' | 'cancelled' | 'failed' | 'raw' | 'void';

export interface HistoryEntry {
  id: string;
  timestamp: string;
  asrText: string;
  formattedText: string; // after cleanup/style/dictionary/snippets
  pastedText: string | null;
  editedText: string | null;
  status: HistoryStatus;
  app: string; // process name, e.g. "notepad"
  appTitle: string;
  duration: number; // seconds of capture
  speechDuration: number; // seconds of detected speech
  numWords: number;
  language: string;
  mode: DictationMode;
  cleanupLevel: CleanupLevel;
  styleContext: StyleContext;
  hasAudio: boolean;
  hasRevertedAI: boolean;
  isArchived: boolean;
  numDictionaryReplacements: number;
  numWordsCorrected: number;
  latencyMs: number;
  error: string | null;
  feedback?: string | null;
  accessibilityContext?: string | null;
  detectedLanguage?: string | null;
  outputLanguage?: string | null;
  localPipelineText?: string | null;
  llmText?: string | null;
  toneMatchedText?: string | null;
  defaultAsrText?: string | null;
  fallbackAsrText?: string | null;
  defaultFormattedText?: string | null;
  fallbackFormattedText?: string | null;
  usedFallbackAsr?: boolean;
  usedFallbackFormatting?: boolean;
  appExe?: string | null;
  appUrl?: string | null;
  selectedText?: string | null;
  pasteOutcome?: 'verified' | 'unverified' | 'blocked' | null;
  pasteDelayed?: boolean;
  instructProvider?: string | null;
  instructVersion?: string | null;
  instructLatencyMs?: number | null;
  instructStatus?: string | null;
  instructRoute?: string | null;
}

// ---------------------------------------------------------------- dictionary & snippets
export interface DictionaryEntry {
  id: string;
  phrase: string; // word to recognise, or misspelling when replacement set
  replacement: string | null; // correct spelling (correction rule) / expansion for snippets
  isSnippet: boolean;
  isStarred: boolean;
  source: 'manual' | 'auto' | 'import';
  frequencyUsed: number;
  lastUsed: string | null;
  createdAt: string;
  modifiedAt: string;
}

export type DictionarySort = 'newest' | 'oldest' | 'alpha' | 'starred';

// ---------------------------------------------------------------- styles & transforms
export interface VoiceStyle {
  context: StyleContext;
  tone: StyleTone;
  apps: string[]; // process names / site keywords this style applies to
}

export interface TransformDef {
  id: string; // 'polish' | 'prompt_engineer' | uuid
  name: string;
  description: string;
  prompt: string; // instructions given to the LLM
  builtIn: boolean;
  shortcut: string | null; // combo, e.g. "Win+Alt+1"
  rules?: { id: string; label: string; enabled: boolean; custom: boolean }[]; // polish only
}

export interface TransformRun {
  id: string;
  transformId: string;
  inputText: string;
  outputText: string;
  app: string;
  status: 'success' | 'failed' | 'cancelled' | 'no_change' | 'undone';
  processingMs: number;
  createdAt: string;
  error: string | null;
}

// ---------------------------------------------------------------- notes (scratchpad)
export interface Note {
  id: string;
  title: string;
  content: string; // HTML
  contentPreview: string;
  pinned: boolean;
  createdAt: string;
  modifiedAt: string;
}

export type NoteVersionSource = 'created' | 'dictated' | 'typed' | 'transform' | 'custom_transform';
export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  source: NoteVersionSource;
  transformName: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------- todos
export interface Todo {
  id: string;
  meetingId: string | null;
  meetingTitle: string | null;
  title: string;
  status: 'open' | 'done';
  priority: 'high' | 'medium' | 'low' | 'none';
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  modifiedAt: string;
}

// ---------------------------------------------------------------- meetings (notetaker)
export type MeetingPhase = 'idle' | 'starting' | 'awaiting_audio' | 'recording' | 'paused' | 'finalizing' | 'done' | 'error';

export interface TranscriptSegment {
  id: string;
  speaker: 'you' | 'others' | string; // diarized speaker id
  speakerName: string; // "You" | "Others" | custom
  start: number; // seconds from meeting start
  end: number;
  text: string;
  edited: boolean;
  translatedText?: string;
  originalText?: string;
}

export interface MeetingSummarySection {
  heading: string;
  bullets: string[];
}

export interface MeetingSummary {
  title: string;
  overview: string;
  sections: MeetingSummarySection[];
  actionItems: { text: string; owner: string | null }[];
  generatedAt: string;
  provider: LlmProvider;
  template: string;
}

export interface Meeting {
  id: string;
  title: string;
  createdAt: string;
  endedAt: string | null;
  durationSec: number;
  app: string | null; // zoom / teams / meet / manual
  myNotes: string; // "My thoughts" HTML
  transcript: TranscriptSegment[];
  summary: MeetingSummary | null;
  summaryStatus: 'none' | 'pending' | 'ready' | 'failed';
  folderIds: string[];
  importSource: string | null;
  isDeleted: boolean;
  language: string;
  isTourDemo?: boolean;
  processingPhase?: 'transcribing' | 'refining' | 'summarizing' | null;
  deliveredSummary?: MeetingSummary | null;
  summaryUpdatedAt?: string | null;
  audioUpdatedAt?: string | null;
  noticePosted?: boolean;
  autoShareEnabled?: boolean;
}

export interface MeetingListItem {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number;
  summaryStatus: Meeting['summaryStatus'];
  preview: string;
  folderIds: string[];
  importSource: string | null;
  participantCount?: number;
  taskCount?: number;
  noticePosted?: boolean;
  autoShareEnabled?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  description: string;
  meetingCount: number;
  createdAt: string;
}

export interface MeetingChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'done' | 'pending' | 'failed';
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  conferenceUrl: string | null;
  source: string; // ics url/file label
  attendees?: string[];
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needs_action';
  color?: string | null;
}

export interface RecorderState {
  phase: MeetingPhase;
  meetingId: string | null;
  startedAt: number | null;
  elapsedSec: number;
  micLevel: number;
  systemLevel: number;
  liveSegments: TranscriptSegment[];
  error: string | null;
  hasCapturedAudio: boolean;
  systemAudioAvailable: boolean;
  micSilentSec: number;
  storageLow: boolean;
  sleepGapSec: number;
  processingPhase: 'transcribing' | 'refining' | 'summarizing' | null;
}

// ---------------------------------------------------------------- notifications
export interface AppNotification {
  id: string;
  type: 'tip' | 'announcement' | 'milestone' | 'system';
  key: string;
  title: string;
  text: string;
  isRead: boolean;
  isArchived: boolean;
  createdAt: string;
}

/** Transient toast shown by the Flow bar or hub. */
export interface Toast {
  id: string;
  key: string; // notification type key, e.g. 'TranscriptCancelled'
  title: string;
  body?: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
  actions?: { id: string; label: string }[];
  durationMs?: number;
  target: 'bar' | 'hub';
}


export interface MeetingAnalytics {
  weeks: { label: string; topics: { topic: string; minutes: number }[] }[];
  recordedCount: number;
  averageDurationMin: number;
  people: { name: string; minutes: number; meetings: number }[];
  analyzedCount: number;
  requiredCount: number;
}
// ---------------------------------------------------------------- stats & insights
export interface Stats {
  totalWords: number;
  averageWpm: number;
  dayStreak: number;
  longestDayStreak: number;
  weekStreak: number;
  wordsToday: number;
  wordsThisWeek: number;
  wordsThisMonth: number;
  wordsLastMonthToDate: number;
  totalDictations: number;
  wordsCorrected: number;
  dictionaryFixes: number;
  appsUsed: { app: string; words: number; count: number; category: AppCategory }[];
  categoryWords: Record<AppCategory, number>;
  heatmap: { date: string; words: number; topApp: string | null; apps: number }[]; // last 365 days
}

export type AppCategory = 'ai_prompts' | 'documents' | 'emails' | 'personal_messages' | 'work_messages' | 'other';

export interface VoiceProfile {
  status: 'locked' | 'not_started' | 'building' | 'ready' | 'failed';
  wordsUntilUnlock: number;
  generatedAt: string | null;
  headline: string | null;
  persona: string | null;
  summary: string | null;
  superpowerTitle: string | null;
  superpowerDescription: string | null;
  catchPhrase: string | null;
  mostUsedWord: string | null;
  mostRemovedWord: string | null;
  peakTimeLabel: string | null;
  peakTopApp: string | null;
}

// ---------------------------------------------------------------- devices / misc
export interface AudioDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export interface ActiveAppInfo {
  exe: string;
  processName: string;
  title: string;
}

export interface AsrModelInfo {
  id: string; // e.g. 'base.en'
  label: string;
  sizeMb: number;
  multilingual: boolean;
  installed: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  command: string; // slash command, e.g. "action-items"
  category: 'before' | 'after' | 'across' | 'more';
  scope: 'one' | 'multiple' | 'both';
  builtIn: boolean;
  createdAt: string;
  modifiedAt: string;
}

export interface MemoryEvent {
  id: string;
  source: string;
  title: string;
  detail: string;
  status: string;
  createdAt: string;
}

export interface MemoryPerson {
  name: string;
  meetingCount: number;
  minutes: number;
  lastMet: string;
  mentions: number;
}

export interface MemoryLink {
  url: string;
  host: string;
  count: number;
  lastSeen: string;
  sources: string[];
}

export interface MemoryDoc {
  id: string;
  folder: 'knowledge' | 'people' | 'preferences' | 'projects' | 'timeline' | 'other';
  title: string;
  content: string; // markdown
  source: string; // what produced the latest change
  changedBy: 'agent' | 'user' | 'setup';
  modifiedAt: string;
  versions: { content: string; modifiedAt: string; changedBy: string }[];
}

export interface MemoryStatus {
  state: 'idle' | 'running' | 'failed';
  lastRunAt: string | null;
  docCount: number;
  sources: { meetings: number; dictations: number; notes: number };
  error: string | null;
}

export interface LlmStatus {
  provider: LlmProvider;
  available: boolean;
  version: string | null;
  error: string | null;
}
