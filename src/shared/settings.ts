// User settings: single JSON document persisted by main; renderers read/patch via the settings API.
import type { CleanupLevel, CustomVoiceStyle, LlmProvider, StyleContext, StyleTone, Theme, TransformDef } from './types';

export type ShortcutAction =
  | 'ptt'
  | 'popo'
  | 'cancel'
  | 'pasteLast'
  | 'copyLast'
  | 'command'
  | 'lens'
  | 'instruct'
  | 'polish'
  | 'viewDiff'
  | 'transformPicker'
  | 'openScratchpad'
  | 'startNotetaker'
  | 'pressEnter'
  | 'focusMode';

export type ScratchpadOpenBehavior = 'resume' | 'new_tab' | 'last_pinned';
export type LocalDataStorage = 'store_normally' | 'auto_delete_24h' | 'never_store';
export type TypingReminderMode = 'disabled' | 'all' | 'previously_used' | 'categories';

export interface Settings {
  version: number;
  // onboarding & profile
  onboardingComplete: boolean;
  onboardingStep: string;
  onboardingDeferred: boolean;
  postOnboardingCompleted: boolean;
  onboardingPagesCompleted: { page: string; completed: boolean }[];
  onboardingPermissions: { name: 'accessibility' | 'microphone' | 'screen_capture' | 'system_audio'; clicked: boolean; granted: boolean }[];
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    avatarDataUrl: string | null;
    heardAbout: string | null;
    intents: ('dictation' | 'notetaker')[];
    role: string | null;
    workType: string | null;
    typingLocations: string[];
    writingNeeds: string[];
    meetingTools: string[];
    meetingFrustrations: string[];
    meetingTypes: string[];
    typingMinutesPerDay: number;
  };
  // general
  shortcuts: Record<ShortcutAction, string[]>;
  micDeviceId: string; // 'default' = auto-detect
  micRanking: string[]; // device labels in preference order
  micForgottenDeviceIds: string[];
  languages: string[]; // ISO codes
  autoDetectLanguage: boolean;
  hinglishEnabled: boolean;
  appLanguage: string | null; // null = system default
  theme: Theme;
  emailLocale: string | null;
  zoom: number; // 0.8 .. 1.5
  // system
  launchAtLogin: boolean;
  showFlowBar: boolean;
  flowBarHiddenUntil: number; // ms epoch; 0 = not snoozed
  flowBarDock: 'bottom' | 'left' | 'right';
  scratchpadInFlowBar: boolean;
  sounds: boolean;
  selectedSoundFolder: string | null;
  muteAudioWhileDictating: boolean;
  pauseMediaWhileDictating: boolean;
  notifications: { suggestions: boolean; announcements: boolean; milestones: boolean; processingDelay: boolean };
  typingReminder: { mode: TypingReminderMode; categories: string[]; mutedUntil: number; appearance: 'compact' | 'expanded' };
  scratchpadOpenBehavior: ScratchpadOpenBehavior;
  autoAddToDictionary: boolean;
  creatorMode: boolean;
  emailSignature: { enabled: boolean; option: 'written' | 'spoken' };
  appTranscriptionFormats: { app: string; format: 'raw' | 'formatted' }[];
  disabledApps: string[];
  // dictation / AI
  cleanupLevel: CleanupLevel;
  smartFormatting: { lists: boolean; backtrack: boolean; emails: boolean; spokenPunctuation: boolean };
  styles: Record<StyleContext, { tone: StyleTone; apps: string[]; instructions?: string; cleanupLevel: CleanupLevel }>;
  customStyles: CustomVoiceStyle[];
  personalizationComplete: boolean;
  transformsEnabled: boolean;
  transformAutoPaste: boolean;
  autoApplyAfterDictation: { active: boolean; transformId: string };
  transforms: TransformDef[];
  writingSamples: string[];
  commandModeEnabled: boolean;
  pressEnterCommandEnabled: boolean;
  stackedMessages: boolean;
  focusMode: { enabled: boolean; blockedApps: string[]; blockedUrls: string[] };
  mouseFlow: { dictateButton: number | null; enterButton: number | null };
  vibeCoding: { variableRecognition: boolean; fileTagging: boolean };
  cursorIdeIntegration: boolean;
  jabraWearDetectionEnabled: boolean;
  contextAwareness: boolean;
  toneMatchingEnabled: boolean;
  shouldOCRScreenCapture: boolean;
  autoCleanup: { diffShownCount: number };
  contextualNudge: { mode: 'not_set' | 'all' | 'previously_used' | 'categories' };
  // engines
  llm: { provider: LlmProvider; claudeModel: string; codexModel: string; timeoutSec: number };
  asr: { model: string; threads: number };
  // notetaker
  notetaker: {
    notifyBeforeMeetingMin: 0 | 0.25 | 1 | 2; // 0 = never
    autoDetectCalls: boolean;
    autoStart: boolean;
    maxRecordingMin: 30 | 60 | 120 | 180 | 240 | 360;
    stopWhenCallEnds: boolean;
    hideInScreenCapture: boolean;
    notepadView: 'open' | 'hidden' | 'side_by_side';
    showLiveTranscript: boolean;
    speakerNames: boolean;
    openSummaryWhenReady: boolean;
    consentChatNotice: boolean;
    consentMessage: string;
    summaryTemplate: string;
    calendarIcsSources: string[]; // file paths or URLs
    translationLanguage: string | null;
    autoStartOptInState: 'none' | 'enabled' | 'disabled';
    longMeetingCheckIn: boolean;
    autoDetectParticipantNames: boolean;
    splitScreenJoin: boolean;
    detectionAction: 'notify' | 'do_nothing';
    autoOpenSummaryCloseCount: number;
    earlyNotepadCloseCount: number;
    autoHidePromptShown: boolean;
    calendarNotifications: boolean;
    calendarChoice: 'none' | 'ics' | 'icloud' | 'outlook';
    calendarNotice: 'off' | 'on';
    autoShareNotesType: 'all' | 'internal' | 'none';
    orgInsightsDefault: boolean;
    quota: { limit: number; remaining: number };
    meetingCount: number;
    hasRecordedRealMeeting: boolean;
    transcriptRetentionDays: number | null;
    transcriptRetentionWarnedAt: number | null;
    granolaImported: boolean;
    granolaExportPromptedAt: number | null;
    firefliesExportPromptedAt: number | null;
    aggressiveAutoSave: boolean;
    unsupportedLanguagesWarned: string[];
    translationDetectedShownLanguages: string[];
  };
  // data & privacy
  localDataStorage: LocalDataStorage;
  storeAudio: boolean;
  showPublicInformation: boolean;
  showNextMeetingInTray: boolean;
  internal: {
    shouldSaveAxText: boolean;
    showDebugOutlines: boolean;
    preserveIntentsOnRestart: boolean;
    isAutoInstructEnabled: boolean;
    instructPasteOnEmptyContext: boolean;
  };
  // ui state
  sidebarOpen: boolean;
  dictionarySort: 'newest' | 'oldest' | 'alpha' | 'starred';
  notesViewType: 'grid' | 'list';
  dismissedBanners: string[];
  nudges: Record<string, { lastShown: number; count: number }>;
  lastNotificationReadTime: number;
}

export const POLISH_RULES = [
  { id: 'concise', label: 'Make more concise', enabled: true },
  { id: 'tone', label: 'Maintain your tone', enabled: true },
  { id: 'clarity', label: 'Reword for clarity', enabled: true },
  { id: 'reorder', label: 'Reorder for readability', enabled: true },
  { id: 'structure', label: 'Add structure for readability', enabled: true },
  { id: 'main_point', label: 'Clarify main point', enabled: false },
  { id: 'impact', label: 'Refine phrasing for impact', enabled: false },
];

export const BUILT_IN_TRANSFORMS: TransformDef[] = [
  {
    id: 'polish',
    name: 'Polish',
    description: 'Improve clarity and conciseness',
    prompt: 'Polish the text while preserving the author\'s voice.',
    builtIn: true,
    shortcut: 'Win+Alt+1',
    rules: POLISH_RULES.map((r) => ({ ...r, custom: false })),
  },
  {
    id: 'prompt_engineer',
    name: 'Prompt Engineer',
    description: 'Constructs optimal prompts',
    prompt:
      'Rewrite the text as a clear, well-structured prompt for an AI assistant: state the goal, give relevant context, list constraints and the desired output format. Keep every requirement the author mentioned.',
    builtIn: true,
    shortcut: 'Win+Alt+2',
  },
];

export const DEFAULT_STYLE_APPS: Record<StyleContext, string[]> = {
  work: ['slack', 'teams', 'ms-teams', 'discord', 'mattermost', 'zoom'],
  email: ['outlook', 'olk', 'thunderbird', 'gmail', 'superhuman', 'mail', 'hxoutlook'],
  personal: ['whatsapp', 'telegram', 'signal', 'messenger', 'wechat', 'imessage', 'messages'],
  other: [],
};

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  onboardingComplete: false,
  onboardingStep: 'welcome',
  onboardingDeferred: false,
  postOnboardingCompleted: false,
  onboardingPagesCompleted: [],
  onboardingPermissions: [],
  profile: {
    firstName: '',
    lastName: '',
    email: '',
    avatarDataUrl: null,
    heardAbout: null,
    intents: ['dictation', 'notetaker'],
    role: null,
    workType: null,
    typingLocations: [],
    writingNeeds: [],
    meetingTools: [],
    meetingFrustrations: [],
    meetingTypes: [],
    typingMinutesPerDay: 60,
  },
  shortcuts: {
    ptt: ['Ctrl+Win'],
    popo: ['Ctrl+Win+Space'],
    cancel: ['Esc'],
    pasteLast: ['Alt+Shift+Z'],
    copyLast: ['Alt+Shift+X'],
    command: [],
    lens: ['Ctrl+Win+Alt'],
    instruct: [],
    polish: ['Win+Alt+1'],
    transformPicker: ['Win+Alt+T'],
    viewDiff: [],
    openScratchpad: [],
    startNotetaker: ['Win+M+Space'],
    pressEnter: [],
    focusMode: [],
  },
  micDeviceId: 'default',
  micRanking: [],
  micForgottenDeviceIds: [],
  languages: ['en'],
  autoDetectLanguage: false,
  hinglishEnabled: false,
  appLanguage: null,
  theme: 'light',
  emailLocale: null,
  zoom: 1,
  launchAtLogin: true,
  showFlowBar: true,
  flowBarHiddenUntil: 0,
  flowBarDock: 'bottom',
  scratchpadInFlowBar: false,
  sounds: true,
  selectedSoundFolder: null,
  muteAudioWhileDictating: true,
  pauseMediaWhileDictating: false,
  notifications: { suggestions: true, announcements: true, milestones: true, processingDelay: true },
  typingReminder: { mode: 'disabled', categories: [], mutedUntil: 0, appearance: 'compact' },
  scratchpadOpenBehavior: 'resume',
  autoAddToDictionary: true,
  creatorMode: false,
  emailSignature: { enabled: false, option: 'written' },
  appTranscriptionFormats: [],
  disabledApps: [],
  cleanupLevel: 'light',
  smartFormatting: { lists: true, backtrack: true, emails: true, spokenPunctuation: true },
  styles: {
    work: { tone: 'formal', apps: DEFAULT_STYLE_APPS.work, instructions: '', cleanupLevel: 'light' },
    email: { tone: 'formal', apps: DEFAULT_STYLE_APPS.email, instructions: '', cleanupLevel: 'light' },
    personal: { tone: 'formal', apps: DEFAULT_STYLE_APPS.personal, instructions: '', cleanupLevel: 'light' },
    other: { tone: 'formal', apps: [], instructions: '', cleanupLevel: 'light' },
  },
  customStyles: [],
  personalizationComplete: false,
  transformsEnabled: true,
  transformAutoPaste: true,
  autoApplyAfterDictation: { active: false, transformId: 'polish' },
  transforms: BUILT_IN_TRANSFORMS,
  writingSamples: [],
  commandModeEnabled: false,
  pressEnterCommandEnabled: false,
  stackedMessages: false,
  focusMode: { enabled: false, blockedApps: ['slack', 'superhuman'], blockedUrls: ['hex.com', 'slack.com', 'mail.google.com', 'superhuman.com', 'x.com', 'twitter.com'] },
  mouseFlow: { dictateButton: 4, enterButton: 5 },
  vibeCoding: { variableRecognition: false, fileTagging: true },
  cursorIdeIntegration: false,
  jabraWearDetectionEnabled: false,
  contextAwareness: true,
  toneMatchingEnabled: false,
  shouldOCRScreenCapture: false,
  autoCleanup: { diffShownCount: 0 },
  contextualNudge: { mode: 'not_set' },
  llm: { provider: 'claude', claudeModel: 'haiku', codexModel: '', timeoutSec: 60 },
  asr: { model: 'base.en', threads: 4 },
  notetaker: {
    notifyBeforeMeetingMin: 0.25,
    autoDetectCalls: true,
    autoStart: false,
    maxRecordingMin: 120,
    stopWhenCallEnds: true,
    hideInScreenCapture: false,
    notepadView: 'open',
    showLiveTranscript: true,
    speakerNames: true,
    openSummaryWhenReady: true,
    consentChatNotice: false,
    consentMessage: "Hi everyone — quick note that I'm using Murmur to transcribe this meeting so I can stay focused. Let me know if you'd prefer I didn't.",
    summaryTemplate: 'auto',
    calendarIcsSources: [],
    translationLanguage: null,
    autoStartOptInState: 'none',
    longMeetingCheckIn: true,
    autoDetectParticipantNames: true,
    splitScreenJoin: false,
    detectionAction: 'notify',
    autoOpenSummaryCloseCount: 0,
    earlyNotepadCloseCount: 0,
    autoHidePromptShown: false,
    calendarNotifications: true,
    calendarChoice: 'none',
    calendarNotice: 'off',
    autoShareNotesType: 'all',
    orgInsightsDefault: true,
    quota: { limit: 50, remaining: 50 },
    meetingCount: 0,
    hasRecordedRealMeeting: false,
    transcriptRetentionDays: null,
    transcriptRetentionWarnedAt: null,
    granolaImported: false,
    granolaExportPromptedAt: null,
    firefliesExportPromptedAt: null,
    aggressiveAutoSave: false,
    unsupportedLanguagesWarned: [],
    translationDetectedShownLanguages: [],
  },
  localDataStorage: 'store_normally',
  storeAudio: true,
  showPublicInformation: true,
  showNextMeetingInTray: true,
  internal: {
    shouldSaveAxText: false,
    showDebugOutlines: false,
    preserveIntentsOnRestart: false,
    isAutoInstructEnabled: false,
    instructPasteOnEmptyContext: false,
  },
  sidebarOpen: true,
  dictionarySort: 'newest',
  notesViewType: 'grid',
  dismissedBanners: [],
  nudges: {},
  lastNotificationReadTime: 0,
};

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

/** Merge a patch into settings: plain objects merge recursively, arrays and primitives replace. */
export function mergeSettings<T>(base: T, patch: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue;
    const cur = out[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)
        ? mergeSettings(cur, v as DeepPartial<typeof cur>)
        : v;
  }
  return out as T;
}
