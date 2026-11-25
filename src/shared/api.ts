// The complete renderer-callable API surface. Each namespace is implemented in src/main/features/<ns>.ts.
import type { DeepPartial, Settings, ShortcutAction } from './settings';
import type { MemoryDoc, MemoryStatus, Skill } from './types';
import type {
  ActiveAppInfo,
  AppNotification,
  AsrModelInfo,
  CalendarEvent,
  DictationState,
  DictionaryEntry,
  DictionarySort,
  Folder,
  HistoryEntry,
  LlmProvider,
  LlmStatus,
  Meeting,
  MeetingChatMessage,
  MeetingListItem,
  Note,
  NoteVersion,
  NoteVersionSource,
  RecorderState,
  Stats,
  Todo,
  TransformRun,
  VoiceProfile,
} from './types';

export interface AppApi {
  getVersion(): string;
  getPlatformInfo(): { platform: string; arch: string; userData: string; isPackaged: boolean };
  openExternal(url: string): void;
  openPath(path: string): void;
  quit(): void;
  restart(): void;
  resetApp(): void;
  openHub(route?: string): void;
  openSettings(section?: string): void;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  getActiveApp(): ActiveAppInfo;
  listRunningApps(): string[];
  copyText(text: string): void;
  readClipboard(): string;
  playSound(name: 'start' | 'stop' | 'paste' | 'notification' | 'achievement'): void;
  completeOnboarding(): void;
  exportData(categories: string[]): string; // returns saved file path
  deleteData(categories: string[]): void;
  importFile(kind: 'dictionary' | 'snippets', path: string): { imported: number; skipped: number };
  pickFile(filters: { name: string; extensions: string[] }[]): string | null;
}

export interface SettingsApi {
  get(): Settings;
  patch(patch: DeepPartial<Settings>): Settings;
  reset(): Settings;
  /** Start capturing the next key chord pressed anywhere; resolves with normalized combo. */
  recordShortcut(): string;
  cancelRecordShortcut(): void;
  setShortcut(action: ShortcutAction, combos: string[]): Settings;
  resetShortcuts(): Settings;
}

export interface DictationApi {
  getState(): DictationState;
  start(mode: 'ptt' | 'popo'): void;
  stop(): void;
  cancel(): void;
  pasteLast(): void;
  copyLast(): void;
  retry(historyId: string): HistoryEntry;
  /** Run the text pipeline on text without audio (used by onboarding practice & tests). */
  formatText(text: string, app?: string): string;
  /** Renderer capture window pushes PCM16 mono 16k audio chunks while recording. */
  pushAudio(chunk: ArrayBuffer, level: number): void;
  /** Capture window signals all audio for the current dictation has been pushed (after a stop command). */
  captureEnded(error?: string | null): void;
  hideBarFor(ms: number): void;
}

export interface HistoryApi {
  list(opts: { query?: string; limit?: number; offset?: number; includeArchived?: boolean }): HistoryEntry[];
  get(id: string): HistoryEntry | null;
  delete(id: string): void;
  archive(id: string, archived: boolean): void;
  undoAiEdit(id: string): HistoryEntry;
  redoAiEdit(id: string): HistoryEntry;
  getAudio(id: string): ArrayBuffer | null; // WAV bytes
  saveAudioAs(id: string): string | null;
  clearAll(): void;
}

export interface DictionaryApi {
  list(opts: { snippets: boolean; query?: string; sort?: DictionarySort }): DictionaryEntry[];
  add(entry: { phrase: string; replacement?: string | null; isSnippet: boolean }): { entry: DictionaryEntry; warning: string | null };
  update(id: string, patch: { phrase?: string; replacement?: string | null; isStarred?: boolean }): { entry: DictionaryEntry; warning: string | null };
  remove(ids: string[]): void;
  counts(): { words: number; snippets: number };
}

export interface TransformsApi {
  /** Run a transform on text (no paste). */
  run(transformId: string, text: string, instruction?: string): TransformRun;
  /** Apply transform to the selected text in the foreground app (copy selection -> transform -> paste). */
  applyToSelection(transformId: string): TransformRun | null;
  history(limit: number): TransformRun[];
  undoLast(): void;
  resetDefaults(): Settings;
}

export interface StylesApi {
  preview(context: string, tone: string, sample: string): string;
}

export interface NotesApi {
  list(opts: { query?: string; limit?: number; offset?: number }): Note[];
  get(id: string): Note | null;
  create(init?: { title?: string; content?: string }): Note;
  update(id: string, patch: { title?: string; content?: string; pinned?: boolean }, versionSource?: NoteVersionSource): Note;
  remove(id: string): void;
  versions(noteId: string): NoteVersion[];
  restoreVersion(versionId: string): Note;
  transform(noteId: string, instruction: string, transformId?: string): Note;
  suggestions(noteId: string): string[];
  sendToApp(noteId: string): { app: string } | null;
  openScratchpad(noteId?: string): void;
  addImage(noteId: string, dataUrl: string): string; // returns murmur-image:// url
}

export interface TodosApi {
  list(opts: { archived: boolean; query?: string }): Todo[];
  add(title: string, meetingId?: string | null): Todo;
  update(id: string, patch: { title?: string; status?: Todo['status']; isArchived?: boolean; sortOrder?: number }): Todo;
  remove(ids: string[]): void;
  archiveMany(ids: string[], archived: boolean): void;
}

export interface MeetingsApi {
  list(opts: { query?: string; folderId?: string | null; limit?: number }): MeetingListItem[];
  get(id: string): Meeting | null;
  rename(id: string, title: string): Meeting;
  updateNotes(id: string, html: string): void;
  editSegment(id: string, segmentId: string, text: string): Meeting;
  renameSpeaker(id: string, speaker: string, name: string): Meeting;
  correctSegment(id: string, segmentId: string, expectedText: string, text: string): Meeting;
  revertSegment(id: string, segmentId: string): Meeting;
  remove(id: string): void;
  regenerateSummary(id: string, template?: string): Meeting;
  chat(id: string, message: string): MeetingChatMessage[];
  chatHistory(id: string): MeetingChatMessage[];
  saveChatFact(id: string, messageId: string): void;
  extractTodos(id: string): Todo[];
  exportMarkdown(id: string): string; // file path
  importFiles(paths: string[]): MeetingListItem[]; // audio (transcribed locally) or text transcripts
  importGranola(): { imported: number };
  cancelGranolaImport(): void;
  listFolders(): Folder[];
  createFolder(name: string, description?: string): Folder;
  renameFolder(id: string, name: string): Folder;
  deleteFolder(id: string): void;
  setFolders(meetingId: string, folderIds: string[]): void;
  upcoming(): CalendarEvent[];
  refreshCalendar(): CalendarEvent[];
  snoozeCalendar(eventId: string): void;
  getBrief(eventId: string): { title: string; content: string };
  rateSummary(id: string, rating: 'up' | 'down' | null, note?: string): void;
  summaryVersions(id: string): { id: string; source: string; createdAt: string; summary: Meeting['summary'] }[];
}

export interface RecorderApi {
  getState(): RecorderState;
  start(opts?: { title?: string; calendarEventId?: string; isTourDemo?: boolean; replaceActive?: boolean }): RecorderState;
  stop(): RecorderState;
  pause(): RecorderState;
  resume(): RecorderState;
  retrySystemAudio(): RecorderState;
  systemAudioStatus(available: boolean, reason?: 'unavailable' | 'dropped'): RecorderState;
  splitScreen(): boolean;
  getWindowState(): { maximized: boolean; width: number; height: number };
  setWindowSize(width: number, height: number): void;
  /** Capture window pushes mixed PCM16 16k for each source. */
  pushAudio(source: 'mic' | 'system', chunk: ArrayBuffer, level: number): void;
  openNotepad(meetingId?: string): void;
}

export interface StatsApi {
  get(): Stats;
  voiceProfile(): VoiceProfile;
  generateVoiceProfile(): VoiceProfile;
}

export interface NotificationsApi {
  list(archived: boolean): AppNotification[];
  markAllRead(): void;
  archive(ids: string[]): void;
  unreadCount(): number;
  toastAction(toastId: string, actionId: string): void;
  dismissToast(toastId: string): void;
}

export interface EnginesApi {
  llmStatus(provider?: LlmProvider): LlmStatus;
  testLlm(provider: LlmProvider): { ok: boolean; output: string; ms: number };
  asrModels(): AsrModelInfo[];
  downloadAsrModel(id: string): void; // progress via 'asr:download' event
  asrStatus(): { ready: boolean; model: string; error: string | null };
  listAudioDevices(): { deviceId: string; label: string }[];
}

export interface SkillsApi {
  list(): Skill[];
  save(skill: Omit<Skill, 'id' | 'builtIn' | 'createdAt' | 'modifiedAt'> & { id?: string }): Skill;
  remove(id: string): void;
  /** Run a skill over one or more meetings (or recent meetings when empty); returns markdown output. */
  run(skillId: string, meetingIds: string[]): string;
}

export interface MemoryApi {
  status(): MemoryStatus;
  /** Build/refresh memory documents from local meetings, dictations and notes (runs in background). */
  build(): MemoryStatus;
  list(): MemoryDoc[];
  get(id: string): MemoryDoc | null;
  save(id: string, content: string): MemoryDoc;
  search(query: string): { docId: string; title: string; line: number; text: string }[];
  deleteAll(): void;
}

export interface McpApi {
  serverCommand(): { command: string; args: string[]; configJson: string };
}

export interface MurmurApi {
  app: AppApi;
  settings: SettingsApi;
  dictation: DictationApi;
  history: HistoryApi;
  dictionary: DictionaryApi;
  transforms: TransformsApi;
  styles: StylesApi;
  notes: NotesApi;
  todos: TodosApi;
  meetings: MeetingsApi;
  recorder: RecorderApi;
  stats: StatsApi;
  notifications: NotificationsApi;
  engines: EnginesApi;
  mcp: McpApi;
  skills: SkillsApi;
  memory: MemoryApi;
}
