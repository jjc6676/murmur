// The complete renderer-callable API surface. Each namespace is implemented in src/main/features/<ns>.ts.
import type { DeepPartial, Settings, ShortcutAction } from './settings';
import type { MemoryDoc, MemoryEvent, MemoryLink, MemoryPerson, MemoryStatus, Skill } from './types';
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
  MeetingArtifact,
  MeetingChatSession,
  MeetingAnalytics,
  MeetingListItem,
  Note,
  NoteVersion,
  NoteVersionSource,
  RecorderState,
  Stats,
  Todo,
  TransformRun,
  TranscriptSegment,
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
  onboardingPractice(kind: 'email' | 'list' | 'chatgpt' | 'cursor', input: string): { output: string; refused: boolean };
  getOnboardingStats(): { totalWords: number };
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
  report(id: string, input: { expectedText: string; comments: string }): HistoryEntry;
  exportFeedback(): string | null;
  clearAll(): void;
}

export interface DictionaryApi {
  list(opts: { snippets: boolean; query?: string; sort?: DictionarySort }): DictionaryEntry[];
  add(entry: { phrase: string; replacement?: string | null; replacementHtml?: string | null; isSnippet: boolean }): { entry: DictionaryEntry; warning: string | null };
  update(id: string, patch: { phrase?: string; replacement?: string | null; replacementHtml?: string | null; isStarred?: boolean }): { entry: DictionaryEntry; warning: string | null };
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
  sendTarget(): string | null;
  openScratchpad(noteId?: string): void;
  addImage(noteId: string, dataUrl: string, metadata?: { width: number; height: number; bytes: number }): string; // returns murmur-image:// url
}

export interface TodosApi {
  list(opts: { archived: boolean; query?: string }): Todo[];
  add(title: string, meetingId?: string | null): Todo;
  update(id: string, patch: { title?: string; status?: Todo['status']; priority?: Todo['priority']; isArchived?: boolean; sortOrder?: number }): Todo;
  remove(ids: string[]): void;
  archiveMany(ids: string[], archived: boolean): void;
  recordEmail(input: { todoId: string; to: string; subject: string; body: string }): void;
  saveCalendarFile(input: { todoId: string; title: string; start: string; end: string; guests: string; description: string }): string | null;
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
  deleteSegment(id: string, segmentId: string): Meeting;
  restoreSegment(id: string, segment: TranscriptSegment): Meeting;
  getSpeakerClip(id: string, speaker: string): string | null;
  remove(id: string): void;
  regenerateSummary(id: string, template?: string): Meeting;
  chat(id: string, sessionId: string, message: string, requestId: string): MeetingChatMessage[];
  cancelChat(requestId: string): void;
  chatSessions(id: string): MeetingChatSession[];
  createChatSession(id: string, title?: string): MeetingChatSession;
  renameChatSession(id: string, sessionId: string, title: string): MeetingChatSession;
  deleteChatSession(id: string, sessionId: string): void;
  chatHistory(id: string, sessionId: string): MeetingChatMessage[];
  askAll(message: string): string;
  saveChatFact(id: string, messageId: string): void;
  listArtifacts(id: string): MeetingArtifact[];
  createArtifact(id: string, messageId: string, title?: string): MeetingArtifact;
  deleteArtifact(id: string, artifactId: string): void;
  extractTodos(id: string): Todo[];
  exportMarkdown(id: string): string; // file path
  importFiles(paths: string[]): MeetingListItem[]; // audio (transcribed locally) or text transcripts
  importGranola(): { imported: number };
  importGranolaExport(path: string): { imported: number; total: number };
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
  translateSummary(id: string, language: string): { summary: Meeting['summary']; language: string; sourceGeneratedAt: string; createdAt: string };
  summaryTranslations(id: string): { language: string; sourceGeneratedAt: string; createdAt: string; summary: Meeting['summary'] }[];
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
  toggleMaximize(): boolean;
  toggleFullScreen(): boolean;
  setWindowSize(width: number, height: number): void;
  /** Capture window pushes mixed PCM16 16k for each source. */
  pushAudio(source: 'mic' | 'system', chunk: ArrayBuffer, level: number): void;
  openNotepad(meetingId?: string): void;
}

export interface StatsApi {
  get(): Stats;
  voiceProfile(): VoiceProfile;
  generateVoiceProfile(): VoiceProfile;
  meetingAnalytics(): MeetingAnalytics;
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
  /** Ask a free-form question over recent local meetings. */
  ask(requestId: string, query: string): string;
  cancelAsk(requestId: string): void;
}

export interface MemoryApi {
  status(): MemoryStatus;
  /** Build/refresh memory documents from local meetings, dictations and notes (runs in background). */
  build(): MemoryStatus;
  list(): MemoryDoc[];
  get(id: string): MemoryDoc | null;
  save(id: string, content: string): MemoryDoc;
  search(query: string): { docId: string; title: string; line: number; text: string }[];
  addFact(text: string, source: string): MemoryDoc;
  removeFact(text: string): MemoryDoc | null;
  runDreamer(): MemoryStatus;
  events(): MemoryEvent[];
  people(): MemoryPerson[];
  links(): MemoryLink[];
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
