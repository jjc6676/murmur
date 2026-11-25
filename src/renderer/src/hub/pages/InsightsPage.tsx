import { useEffect, useState, type CSSProperties } from 'react';
import type { AppCategory, MeetingAnalytics, Stats, VoiceProfile } from '@shared/types';
import { CATEGORY_LABELS, appDisplayName } from '@shared/apps';
import { LockKeyhole, Share2, ShieldCheck, Sparkles } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Button, Card, Dialog, EmptyState, Page, PageHeader, Progress, Tabs } from '../../ui';
import { toast } from '../state';
import s from '../insights/Insights.module.css';

const CATEGORY_ORDER: AppCategory[] = ['ai_prompts', 'work_messages', 'emails', 'personal_messages', 'documents', 'other'];
const format = (value: number): string => value.toLocaleString();
const TYPING_PERCENTILES = [{ wpm: 85, faster: 99 }, { wpm: 70, faster: 97 }, { wpm: 55, faster: 95 }, { wpm: 40, faster: 90 }];
const SHARE_CARDS = ['Murmur Highlights', 'Murmur Streak', 'Murmur Superlatives', 'How fast you Murmur', 'Total words dictated', 'When/Where you Murmur', 'Your Voice Profile'] as const;
type ShareCard = typeof SHARE_CARDS[number];
const funFact = (words: number): string => {
  const equivalents = [
    { size: 90_000, singular: 'book' }, { size: 12_000, singular: 'podcast season' }, { size: 3_000, singular: 'book chapter' },
    { size: 1_200, singular: 'essay' }, { size: 500, singular: 'article' }, { size: 280, singular: 'thoughtful email' }, { size: 40, singular: 'postcard' },
  ];
  const match = equivalents.find((item) => words >= item.size) ?? equivalents[equivalents.length - 1];
  const count = Math.max(1, Math.round(words / match.size));
  return `${count.toLocaleString()} ${match.singular}${count === 1 ? '' : 's'}`;
};
const streakCopy = (days: number, weeks: number): string => {
  if (days >= 365) return 'A full year of momentum. You’re a Murmur legend.';
  if (days >= 100) return 'Triple digits—your voice is a daily habit.';
  if (days >= 30) return 'One month strong. Your ideas keep moving.';
  if (days >= 7) return 'A full week in flow. Keep the streak alive.';
  if (days > 0) return `Day ${days}: every streak starts with showing up.`;
  if (weeks >= 12) return 'A season of consistent weekly momentum.';
  if (weeks > 0) return `${weeks} active ${weeks === 1 ? 'week' : 'weeks'}—welcome to your weekly rhythm.`;
  return 'Dictate today to begin your streak.';
};

async function copyStatsImage(stats: Stats, card: ShareCard, profile: VoiceProfile): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.fillStyle = '#171614';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f5f1e8';
  context.font = '600 38px Figtree';
  context.fillText(card, 70, 95);
  const topApp = stats.appsUsed[0]?.app ?? 'your favorite apps';
  const content: Record<ShareCard, { primary: string; secondary: string; footer: string }> = {
    'Murmur Highlights': { primary: format(stats.totalWords), secondary: 'words dictated', footer: `${stats.averageWpm} WPM · ${stats.dayStreak} day streak` },
    'Murmur Streak': { primary: `${stats.dayStreak} days`, secondary: 'current daily streak', footer: `Longest streak: ${stats.longestDayStreak} days · ${stats.weekStreak} active weeks` },
    'Murmur Superlatives': { primary: format(stats.wordsCorrected), secondary: 'words improved', footer: `${format(stats.dictionaryFixes)} dictionary fixes · ${format(stats.totalDictations)} dictations` },
    'How fast you Murmur': { primary: `${stats.averageWpm} WPM`, secondary: 'average speaking speed', footer: `${format(stats.totalWords)} words moved forward` },
    'Total words dictated': { primary: format(stats.totalWords), secondary: 'total words dictated', footer: `${format(stats.wordsThisMonth)} this month · ${format(stats.wordsToday)} today` },
    'When/Where you Murmur': { primary: topApp, secondary: 'your top dictation app', footer: `${stats.appsUsed.length} apps used · ${format(stats.wordsThisWeek)} words this week` },
    'Your Voice Profile': { primary: profile.persona ?? 'Your voice', secondary: profile.headline ?? 'A voice that sounds like you', footer: profile.catchPhrase ? `“${profile.catchPhrase}”` : 'Private and generated from local dictations' },
  };
  const selected = content[card];
  context.font = selected.primary.length > 20 ? '500 72px Figtree' : '500 112px Figtree';
  context.fillText(selected.primary, 70, 265);
  context.font = '400 30px Figtree';
  context.fillStyle = '#c9c1b4';
  context.fillText(selected.secondary, 76, 310);
  context.fillStyle = '#f5f1e8';
  context.font = '600 42px Figtree';
  context.fillText(selected.footer, 70, 440);
  context.font = '400 25px Figtree';
  context.fillStyle = '#c9c1b4';
  context.fillText('Private. Local. Powered by your voice.', 70, 560);
  const { promise, resolve } = Promise.withResolvers<Blob | null>();
  canvas.toBlob(resolve, 'image/png');
  const blob = await promise;
  if (!blob) throw new Error('Could not create image');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

function UsageView({ stats, analytics }: { stats: Stats; analytics: MeetingAnalytics | null }) {
  const [heatmapPage, setHeatmapPage] = useState(0);
  const total = Math.max(1, stats.totalWords);
  const monthDelta = stats.wordsLastMonthToDate ? Math.round(((stats.wordsThisMonth - stats.wordsLastMonthToDate) / stats.wordsLastMonthToDate) * 100) : 100;
  const maxHeat = Math.max(1, ...stats.heatmap.map((day) => day.words));
  const percentile = TYPING_PERCENTILES.find((item) => stats.averageWpm >= item.wpm);
  const intensity = stats.wordsThisWeek >= 5_000 ? 'Power' : stats.wordsThisWeek >= 1_000 ? 'Moderate' : 'Light';
  const heatmapEnd = stats.heatmap.length - heatmapPage * 182;
  const recentHeatmap = stats.heatmap.slice(Math.max(0, heatmapEnd - 182), heatmapEnd);
  return (
    <div className={s.grid}>
      {stats.totalWords === 0 && <Card padded className={`${s.card} ${s.wide}`}><h2>You’ve written nothing yet—start dictating!</h2></Card>}
      <Card padded className={s.card}>
        <h2>Words per minute</h2>
        <div className={s.split}>
          <strong className={s.bigNumber}>{stats.averageWpm}</strong>
          <div className={s.gauge} style={{ '--gauge': `${Math.min(180, stats.averageWpm * 1.2)}deg` } as CSSProperties} aria-label={`${stats.averageWpm} words per minute`} />
        </div>
        <p className={s.secondary}>{percentile ? `Faster than ${percentile.faster}% of typers based on local typing-speed baselines.` : 'Use Murmur more to see your WPM improve.'}</p>
        <strong className={s.intensity}>{intensity} usage</strong>
      </Card>
      <Card padded className={s.card}>
        <h2>Fixes made by Murmur</h2>
        <div className={s.metricRow}><span>Words corrected</span><strong>{format(stats.wordsCorrected)}</strong></div>
        <div className={s.metricRow}><span>Dictionary fixes</span><strong>{format(stats.dictionaryFixes)}</strong></div>
      </Card>
      <Card padded className={`${s.card} ${s.wide}`}>
        <h2>Total words dictated</h2>
        <div className={s.split}><strong className={s.bigNumber}>{format(stats.totalWords)}</strong><span className={s.secondary}>{monthDelta >= 0 ? '+' : ''}{monthDelta}% this month vs last month</span></div>
        <div className={s.metricRow}><span>Desktop</span><strong>{format(stats.totalWords)} words</strong></div>
        <p className={s.secondary}>That’s roughly {funFact(stats.totalWords)}—all created with your voice.</p>
      </Card>
      <Card padded className={`${s.card} ${s.wide}`}>
        <h2>Desktop usage by category</h2>
        <p className={s.secondary}>Total apps used · {stats.appsUsed.length}{stats.appsUsed[0] ? ` · Most used: ${appDisplayName(stats.appsUsed[0].app)} — this is where your ideas come to life.` : ''}</p>
        <p className={s.secondary}>{stats.appsUsed.length >= 10 ? 'Always in a Murmur state.' : stats.appsUsed.length >= 3 ? 'Your voice is finding more places to work.' : 'Try Murmur in another app.'}</p>
        {CATEGORY_ORDER.map((category) => {
          const words = stats.categoryWords[category];
          const percent = Math.round((words / total) * 100);
          return <div className={s.category} key={category}><span>{CATEGORY_LABELS[category]}</span><div className={s.bar}><span style={{ width: `${percent}%` }} /></div><strong>{percent}%</strong></div>;
        })}
      </Card>
      <Card padded className={`${s.card} ${s.wide}`}>
        <h2>{stats.dayStreak} day streak</h2>
        <p className={s.secondary}>Longest streak · {stats.longestDayStreak} days</p>
        <div className={s.legend}>
          <Button size="sm" variant="ghost" disabled={heatmapEnd <= 182} onClick={() => setHeatmapPage((page) => page + 1)}>Earlier</Button>
          <span>{recentHeatmap[0] ? new Date(`${recentHeatmap[0].date}T12:00:00`).toLocaleDateString(undefined, { month: 'short' }) : ''} – {recentHeatmap.at(-1) ? new Date(`${recentHeatmap.at(-1)!.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short' }) : ''}</span>
          <Button size="sm" variant="ghost" disabled={heatmapPage === 0} onClick={() => setHeatmapPage((page) => Math.max(0, page - 1))}>Later</Button>
        </div>
        <p className={s.secondary}>Mon · Wed · Fri</p>
        <div className={s.heatmap} aria-label="Activity heatmap">
          {recentHeatmap.map((day) => <span key={day.date} className={s.heat} data-level={day.words ? Math.max(1, Math.ceil((day.words / maxHeat) * 4)) : 0} title={`${day.date}: ${day.words} words · ${day.apps} apps${day.topApp ? ` · Top app: ${appDisplayName(day.topApp)}` : ''}`} />)}
        </div>
        <div className={s.legend}><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <span key={level} className={s.heat} data-level={level} />)}<span>More</span></div>
        <p>{streakCopy(stats.dayStreak, stats.weekStreak)}</p>
      </Card>
      <Card padded className={`${s.card} ${s.wide}`}>
        <h2>For you · Meetings</h2>
        {!analytics || analytics.analyzedCount < analytics.requiredCount ? (
          <div className={s.topicLock}><LockKeyhole size={20} /><div><strong>Meeting topics are still taking shape</strong><p>Record {Math.max(0, (analytics?.requiredCount ?? 3) - (analytics?.analyzedCount ?? 0))} more meetings to unlock topic trends.</p></div></div>
        ) : (
          <>
            <div className={s.meetingMetrics}>
              <div><strong>{analytics.recordedCount}</strong><span>recorded</span></div>
              <div><strong>{analytics.averageDurationMin}m</strong><span>average duration</span></div>
              <div><strong>{analytics.people[0]?.name ?? '—'}</strong><span>most shared time</span></div>
            </div>
            <div className={s.topicWeeks}>
              {analytics.weeks.map((week) => <div key={week.label}><span>{week.label}</span>{week.topics.slice(0, 3).map((topic) => <i key={topic.topic} title={`${topic.topic}: ${topic.minutes} minutes`} style={{ height: `${Math.max(4, Math.min(90, topic.minutes))}px` }} />)}</div>)}
            </div>
            {analytics.people.length > 0 && <p className={s.secondary}>Most shared time: {analytics.people.map((person) => `${person.name} (${person.minutes}m)`).join(' · ')}</p>}
          </>
        )}
      </Card>
    </div>
  );
}

function VoiceView({ stats, profile, onGenerated }: { stats: Stats; profile: VoiceProfile; onGenerated: (profile: VoiceProfile) => void }) {
  const [building, setBuilding] = useState(false);
  const generate = async () => {
    setBuilding(true);
    try {
      onGenerated(await api.stats.generateVoiceProfile());
    } catch (error) {
      toast('Couldn’t generate voice profile', { body: errorMessage(error), tone: 'error' });
    } finally {
      setBuilding(false);
    }
  };
  if (profile.status !== 'ready') {
    return (
      <Card className={s.voiceHero}>
        <LockKeyhole size={28} />
        <h2>Your Voice Profile</h2>
        <p>Discover the patterns, phrases, and strengths that make your voice yours.</p>
        {stats.totalWords < 2_000 ? <><Progress value={Math.min(100, stats.totalWords / 20)} /><p className={s.secondary}>Unlocks in {format(profile.wordsUntilUnlock)} words</p></> : <Button loading={building} onClick={() => void generate()}>Generate profile</Button>}
        <p className={s.privacy}><ShieldCheck size={16} /> Your dictations stay private and local. This report is built only from data on this device.</p>
      </Card>
    );
  }
  return (
    <div className={s.grid}>
      <Card className={`${s.voiceHero} ${s.wide}`}>
        <Sparkles size={28} />
        <h2>{profile.headline}</h2>
        <strong>{profile.persona}</strong>
        <div className={s.personaTags} aria-label="Persona vocabulary">{['analysis', 'brainstorm', 'coding', 'collaboration', 'deep thought', 'leadership', 'long writing', 'multilingual', 'on-the-go', 'presenting', 'reporting', 'support'].map((label) => <span key={label}>{label}</span>)}</div>
        <p>{profile.summary}</p>
        <p className={s.secondary}>Created {profile.generatedAt ? new Date(profile.generatedAt).toLocaleDateString() : 'locally'}</p>
        <Button variant="outline" loading={building} onClick={() => void generate()}>Regenerate profile</Button>
      </Card>
      <div className={`${s.voiceFacts} ${s.wide}`}>
        {[['Your superpower', profile.superpowerTitle], ['Catchphrase', profile.catchPhrase], ['Most-used word', profile.mostUsedWord], ['Most removed', profile.mostRemovedWord], ['Peak time', profile.peakTimeLabel], ['Peak app', profile.peakTopApp ? appDisplayName(profile.peakTopApp) : null]].map(([label, value]) => <div className={s.fact} key={label}><span>{label}</span><strong>{value || 'Not enough data'}</strong></div>)}
      </div>
      <p className={`${s.privacy} ${s.wide}`}><ShieldCheck size={16} /> Generated privately from dictations stored on this device.</p>
    </div>
  );
}

export function InsightsPage() {
  const [tab, setTab] = useState<'flow' | 'usage' | 'voice' | 'leaderboard'>('flow');
  const [stats, setStats] = useState<Stats | null>(null);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [analytics, setAnalytics] = useState<MeetingAnalytics | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => {
    void Promise.all([api.stats.get(), api.stats.voiceProfile(), api.stats.meetingAnalytics()]).then(([nextStats, nextProfile, nextAnalytics]) => {
      setStats(nextStats);
      setProfile(nextProfile);
      setAnalytics(nextAnalytics);
    });
  }, []);
  const share = async (card: ShareCard) => {
    if (!stats || !profile) return;
    try {
      await copyStatsImage(stats, card, profile);
      toast(`${card} image copied`, { tone: 'success' });
      setShareOpen(false);
    } catch (error) {
      toast('Couldn’t copy image', { body: errorMessage(error), tone: 'error' });
    }
  };
  return (
    <Page wide>
      <div className={s.page}>
        <PageHeader title="Insights" actions={<Button variant="outline" icon={<Share2 size={16} />} disabled={!stats} onClick={() => setShareOpen(true)}>Share</Button>} />
        <section className={s.snapshot}><strong>You’ve been Murmuring. Hard.</strong><span>Your voice has turned {format(stats?.totalWords ?? 0)} words into momentum.</span></section>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'flow', label: 'Your Flow' }, { id: 'usage', label: 'Your usage' }, { id: 'voice', label: 'Your voice' }, { id: 'leaderboard', label: 'Leaderboard' }]} />
        {stats && profile && (tab === 'leaderboard'
          ? <EmptyState title="Team leaderboard isn’t available offline" body="Murmur has no hosted team account. Your private usage and voice insights remain available on this device." />
          : tab === 'voice'
            ? <VoiceView stats={stats} profile={profile} onGenerated={setProfile} />
            : <UsageView stats={stats} analytics={analytics} />)}
      </div>
        <Dialog open={shareOpen} onClose={() => setShareOpen(false)} title="Share insights" description="Choose a private, locally rendered card to copy as an image." width={620}>
          <div className={s.shareCards}>{SHARE_CARDS.map((card) => <article key={card}><div><strong>{card}</strong><span>Ready to copy as a 1200 × 630 image</span></div><Button size="sm" variant="outline" onClick={() => void share(card)}>Copy image</Button></article>)}</div>
        </Dialog>
    </Page>
  );
}
