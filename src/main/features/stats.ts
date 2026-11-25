// Local usage analytics, milestones, and voice-profile generation.
import type { AppCategory, Stats, VoiceProfile } from '@shared/types';
import { CATEGORY_LABELS, categorizeApp } from '@shared/apps';
import { getCtx } from '../context';
import { handle, onEvent } from '../ipc';
import { addNotification } from '../toasts';

interface UsageRow {
  timestamp: string;
  asrText: string;
  formattedText: string;
  app: string;
  appTitle: string;
  speechDuration: number;
  numWords: number;
  numWordsCorrected: number;
  numDictionaryReplacements: number;
}

const categories: AppCategory[] = ['ai_prompts', 'documents', 'emails', 'personal_messages', 'work_messages', 'other'];
const dateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

function usageRows(): UsageRow[] {
  return getCtx().db.all<UsageRow>(
    "SELECT timestamp, asrText, formattedText, app, appTitle, speechDuration, numWords, numWordsCorrected, numDictionaryReplacements FROM history WHERE status IN ('success', 'raw')",
  );
}

function computeStats(): Stats {
  const rows = usageRows();
  const now = new Date();
  const today = dateKey(now);
  const weekStart = addDays(startOfDay(now), -((now.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthCutoff = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()) + 1);
  const byDate = new Map<string, { words: number; apps: Map<string, number> }>();
  const byApp = new Map<string, { words: number; count: number; category: AppCategory }>();
  const categoryWords = Object.fromEntries(categories.map((category) => [category, 0])) as Record<AppCategory, number>;
  let totalWords = 0;
  let speechDuration = 0;
  let wordsToday = 0;
  let wordsThisWeek = 0;
  let wordsThisMonth = 0;
  let wordsLastMonthToDate = 0;
  let wordsCorrected = 0;
  let dictionaryFixes = 0;

  for (const row of rows) {
    const words = Math.max(0, row.numWords);
    const at = new Date(row.timestamp);
    const key = dateKey(at);
    const category = categorizeApp(row.app, row.appTitle);
    totalWords += words;
    speechDuration += Math.max(0, row.speechDuration);
    wordsCorrected += row.numWordsCorrected;
    dictionaryFixes += row.numDictionaryReplacements;
    if (key === today) wordsToday += words;
    if (at >= weekStart) wordsThisWeek += words;
    if (at >= monthStart) wordsThisMonth += words;
    if (at >= lastMonthStart && at < lastMonthCutoff) wordsLastMonthToDate += words;
    categoryWords[category] += words;
    const app = row.app || 'Unknown';
    const appUsage = byApp.get(app) ?? { words: 0, count: 0, category };
    appUsage.words += words;
    appUsage.count += 1;
    byApp.set(app, appUsage);
    const day = byDate.get(key) ?? { words: 0, apps: new Map<string, number>() };
    day.words += words;
    day.apps.set(app, (day.apps.get(app) ?? 0) + words);
    byDate.set(key, day);
  }

  const activeDates = [...byDate.entries()].filter(([, value]) => value.words > 0).map(([key]) => key).sort();
  const streakEnding = (end: Date): number => {
    let count = 0;
    for (let day = startOfDay(end); byDate.get(dateKey(day))?.words; day = addDays(day, -1)) count += 1;
    return count;
  };
  let longestDayStreak = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of activeDates) {
    const current = new Date(`${key}T12:00:00`);
    run = previous && Math.round((current.getTime() - previous.getTime()) / 86_400_000) === 1 ? run + 1 : 1;
    longestDayStreak = Math.max(longestDayStreak, run);
    previous = current;
  }
  const currentDayStreak = streakEnding(now) || streakEnding(addDays(now, -1));
  const activeWeeks = new Set(activeDates.map((key) => {
    const day = new Date(`${key}T12:00:00`);
    return dateKey(addDays(day, -((day.getDay() + 6) % 7)));
  }));
  let weekStreak = 0;
  for (let week = weekStart; activeWeeks.has(dateKey(week)); week = addDays(week, -7)) weekStreak += 1;
  const heatmap = Array.from({ length: 365 }, (_, index) => {
    const key = dateKey(addDays(now, index - 364));
    const day = byDate.get(key);
    const topApp = day ? [...day.apps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;
    return { date: key, words: day?.words ?? 0, topApp, apps: day?.apps.size ?? 0 };
  });
  return {
    totalWords,
    averageWpm: speechDuration ? Math.round(totalWords / (speechDuration / 60)) : 0,
    dayStreak: currentDayStreak,
    longestDayStreak,
    weekStreak,
    wordsToday,
    wordsThisWeek,
    wordsThisMonth,
    wordsLastMonthToDate,
    totalDictations: rows.length,
    wordsCorrected,
    dictionaryFixes,
    appsUsed: [...byApp.entries()].map(([app, value]) => ({ app, ...value })).sort((a, b) => b.words - a.words),
    categoryWords,
    heatmap,
  };
}

const emptyProfile = (totalWords: number): VoiceProfile => ({
  status: totalWords < 2_000 ? 'locked' : 'not_started',
  wordsUntilUnlock: Math.max(0, 2_000 - totalWords),
  generatedAt: null,
  headline: null,
  persona: null,
  summary: null,
  superpowerTitle: null,
  superpowerDescription: null,
  catchPhrase: null,
  mostUsedWord: null,
  mostRemovedWord: null,
  peakTimeLabel: null,
  peakTopApp: null,
});

function currentProfile(): VoiceProfile {
  const stats = computeStats();
  if (stats.totalWords < 2_000) return emptyProfile(stats.totalWords);
  return getCtx().db.kvGet<VoiceProfile>('voiceProfile', emptyProfile(stats.totalWords));
}

async function generateProfile(): Promise<VoiceProfile> {
  const stats = computeStats();
  if (stats.totalWords < 2_000) return emptyProfile(stats.totalWords);
  const rows = usageRows();
  const text = rows.map((row) => row.formattedText || row.asrText).join('\n').slice(-24_000);
  const words = text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
  const ignored = new Set(['the', 'and', 'that', 'this', 'with', 'you', 'for', 'but', 'are', 'was', 'have', 'from', 'not']);
  const counts = new Map<string, number>();
  for (const word of words) if (!ignored.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const mostUsedWord = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ideas';
  const top = stats.appsUsed[0];
  const hours = rows.reduce((map, row) => {
    const hour = new Date(row.timestamp).getHours();
    map.set(hour, (map.get(hour) ?? 0) + row.numWords);
    return map;
  }, new Map<number, number>());
  const peakHour = [...hours.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 9;
  const summary = await getCtx().llm({
    system: 'Describe this person’s speaking and writing voice in two warm, specific sentences. Output only the description.',
    input: text,
  });
  const profile: VoiceProfile = {
    status: 'ready',
    wordsUntilUnlock: 0,
    generatedAt: new Date().toISOString(),
    headline: 'Your ideas move at the speed of speech',
    persona: top ? `${CATEGORY_LABELS[top.category]} communicator` : 'Thoughtful communicator',
    summary,
    superpowerTitle: 'Clear momentum',
    superpowerDescription: `You turn spoken thoughts into usable writing at ${stats.averageWpm} words per minute.`,
    catchPhrase: words.slice(0, 12).join(' ') || 'Let’s make it happen.',
    mostUsedWord,
    mostRemovedWord: stats.wordsCorrected ? 'filler words' : 'None yet',
    peakTimeLabel: `${peakHour % 12 || 12}:00 ${peakHour < 12 ? 'AM' : 'PM'}`,
    peakTopApp: top?.app ?? null,
  };
  getCtx().db.kvSet('voiceProfile', profile);
  return profile;
}

function emitMilestones(): void {
  const { db } = getCtx();
  const stats = computeStats();
  const emitted = new Set(db.kvGet<string[]>('statsMilestones', []));
  const candidates = [
    ...[1_000, 5_000, 10_000].filter((n) => stats.totalWords >= n).map((n) => ({ key: `words-${n}`, title: `${n.toLocaleString()} words dictated`, text: 'Your voice is doing the heavy lifting.' })),
    ...[3, 7, 30].filter((n) => stats.dayStreak >= n).map((n) => ({ key: `streak-${n}`, title: `${n} day streak`, text: 'Keep the momentum going.' })),
  ];
  for (const item of candidates) {
    if (emitted.has(item.key)) continue;
    emitted.add(item.key);
    addNotification({ type: 'milestone', ...item });
  }
  db.kvSet('statsMilestones', [...emitted]);
}

export function registerStats(): void {
  handle('stats', {
    get: computeStats,
    voiceProfile: currentProfile,
    generateVoiceProfile: generateProfile,
  });
  onEvent('history:changed', emitMilestones);
  emitMilestones();
}
