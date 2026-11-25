import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HistoryEntry, Stats, VoiceProfile } from '@shared/types';
import { ArrowRight, Mic2, Sparkles } from 'lucide-react';
import { api, useEvent } from '../../lib/api';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { Banner, Button, Card, Dialog, EmptyState, Kbd, Page, PageHeader, Progress, SearchInput } from '../../ui';
import { DictationList } from '../home/DictationList';
import s from '../home/Home.module.css';

const USE_CASES = [
  ['Chat with AI', 'Ask questions and ideate quickly.'],
  ['Take a note', 'Capture thoughts and to-dos.'],
  ['Write a message', 'Stay in touch without typing.'],
  ['Draft an email', 'Get through your inbox faster.'],
  ['Write a post or comment', 'Share updates effortlessly.'],
  ['Write a document', 'Move long-form work forward.'],
  ['Prompt Cursor or Devin', 'Ship code hands-free.'],
  ['Something else', 'Explore Murmur anywhere you type.'],
] as const;

const compactNumber = (value: number): string => value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : value.toLocaleString();

export function HomePage() {
  const settings = useSettings();
  const patch = usePatchSettings();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [uses, setUses] = useState<string[]>([]);
  const refresh = useCallback(() => {
    void Promise.all([
      api.history.list({ query: query || undefined, limit: 60 }),
      api.stats.get(),
      api.stats.voiceProfile(),
    ]).then(([nextEntries, nextStats, nextProfile]) => {
      setEntries(nextEntries);
      setStats(nextStats);
      setProfile(nextProfile);
    });
  }, [query]);
  useEffect(refresh, [refresh]);
  useEvent('history:changed', refresh);
  const bannerKey = 'try-another-app';
  const bannerVisible = !settings.dismissedBanners.includes(bannerKey);
  const completeOnboarding = async (selected: string[]) => {
    await patch({ profile: { typingLocations: selected }, postOnboardingCompleted: true });
  };
  return (
    <Page wide>
      <div className={s.home}>
        <PageHeader title={<span className={s.homeHeader}>Welcome back{settings.profile.firstName ? `, ${settings.profile.firstName}` : ''}!</span>} />
        <div className={s.homeGrid}>
          <div className={s.mainColumn}>
            {bannerVisible && (
              <Banner
                title="Try Murmur in another app"
                body="Murmur works anywhere you type."
                actions={<Button variant="light" size="sm">Get started</Button>}
                art={<div className={s.bannerArt} />}
                onDismiss={() => void patch({ dismissedBanners: [...settings.dismissedBanners, bannerKey] })}
              />
            )}
            <SearchInput value={query} onChange={setQuery} placeholder="Search past transcripts" />
            {entries.length ? (
              <DictationList entries={entries} onChanged={refresh} />
            ) : (
              <div className={s.empty}>
                <EmptyState
                  icon={<Mic2 size={32} />}
                  title={query ? 'No matching dictations' : 'No dictations yet'}
                  body={query ? `Nothing matched “${query}”.` : <span>Don’t type, just speak. Hold <Kbd combo={settings.shortcuts.ptt[0] || 'Ctrl+Win'} /> to dictate.</span>}
                />
              </div>
            )}
          </div>
          <aside className={s.sideColumn}>
            <Card padded className={s.stats} aria-label="Dictation stats">
              <div className={s.stat}><strong>{compactNumber(stats?.totalWords ?? 0)}</strong><span>total words</span></div>
              <div className={s.stat}><strong>{stats?.averageWpm ?? 0}</strong><span>wpm</span></div>
              <div className={s.stat}><strong>{stats?.dayStreak ?? 0}</strong><span>day streak</span></div>
            </Card>
            <Card padded className={s.sideCard}>
              <Sparkles size={22} />
              <h2>Your Voice Profile</h2>
              {profile?.status === 'ready' ? (
                <><p>{profile.headline}</p><Link to="/insights" className={s.sideLink}>View your voice <ArrowRight size={14} /></Link></>
              ) : (
                <><p className={s.muted}>Discover how you use your voice.</p><Progress value={stats ? Math.min(100, stats.totalWords / 20) : 0} /><span className={s.muted}>Unlocks in {compactNumber(profile?.wordsUntilUnlock ?? 2_000)} words</span></>
              )}
            </Card>
            <Link to="/notetaker" className={s.sideLink}>
              <Card padded className={s.sideCard}>
                <Mic2 size={22} />
                <h2>Try Notetaker</h2>
                <p className={s.muted}>Never miss a detail with accurate transcripts and summaries</p>
              </Card>
            </Link>
          </aside>
        </div>
      </div>
      <Dialog
        open={!settings.postOnboardingCompleted}
        onClose={() => void completeOnboarding([])}
        title="How would you like to use Murmur first?"
        width={720}
        footer={<><Button variant="ghost" onClick={() => void completeOnboarding([])}>Skip onboarding</Button><Button disabled={!uses.length} onClick={() => void completeOnboarding(uses)}>Try it now</Button></>}
      >
        <div className={s.onboardingPills}>
          {USE_CASES.map(([title, description]) => (
            <button key={title} type="button" className={s.usePill} aria-pressed={uses.includes(title)} onClick={() => setUses((current) => current.includes(title) ? current.filter((item) => item !== title) : [...current, title])}>
              <strong>{title}</strong><span>{description}</span>
            </button>
          ))}
        </div>
        <div className={s.onboardingMock} aria-hidden="true"><div className={s.mockLine} /><div className={s.mockLine} /><div className={s.mockLine} /></div>
      </Dialog>
    </Page>
  );
}
