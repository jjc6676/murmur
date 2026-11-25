import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HistoryEntry, Stats, VoiceProfile } from '@shared/types';
import { ArrowRight, Mic2, Search, X } from 'lucide-react';
import { api, errorMessage, useEvent } from '../../lib/api';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { Button, Card, Dialog, EmptyState, IconButton, Kbd, Page, PageHeader, Progress, SearchInput } from '../../ui';
import { DictationList } from '../home/DictationList';
import { toast, useHubUi } from '../state';
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

const HOME_BANNERS = [
  { key: 'home-redesign', title: 'Home has a new look', body: 'Upcoming meetings, past notes, and recent dictations are now easier to reach.', action: 'Check it out' },
  { key: 'default-hold-to-dictate', title: 'Hold down your shortcut to dictate', body: 'Murmur works in email, messages, docs, and anywhere else you type.', action: 'Got it' },
  { key: 'try-another-app', title: 'Murmur works anywhere you type', body: 'Open any email, message, document, or text box and start speaking.', action: 'Get started' },
  { key: 'snippets', title: 'Speak it once, reuse it anywhere', body: 'Snippets expand short spoken phrases into email, links, addresses, and prompts.', action: 'Try Snippets' },
  { key: 'microphone-quiz', title: 'Working around other people?', body: 'Tune your microphone setup for clear dictation in shared spaces.', action: 'Setup guidance' },
  { key: 'mouse-flow', title: 'Murmur using your mouse', body: 'Keyboards? Who needs them! Configure mouse buttons for dictation.', action: 'Learn more' },
  { key: 'style', title: 'Make Murmur sound like you', body: 'Tune tone, formatting, and app-specific voice.', action: 'Open Style' },
  { key: 'ide-tagging', title: 'Improve dictation in code editors', body: 'Choose which apps Murmur should recognize as coding tools.', action: 'Tag IDEs' },
] as const;

const compactNumber = (value: number): string => value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : value.toLocaleString();
const compactRemaining = (value: number): string => value >= 1_000 && value % 1_000 === 0 ? `${value / 1_000}K` : compactNumber(value);

export function HomePage() {
  const settings = useSettings();
  const patch = usePatchSettings();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [profileBuilding, setProfileBuilding] = useState(false);
  const [uses, setUses] = useState<string[]>([]);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [welcomeHelp, setWelcomeHelp] = useState('');
  const [mountedAt] = useState(() => Date.now());
  const refresh = useCallback(() => {
    setSearching(true);
    void Promise.all([
      api.history.list({ query: query || undefined, limit: 60 }),
      api.stats.get(),
      api.stats.voiceProfile(),
    ]).then(([nextEntries, nextStats, nextProfile]) => {
      setEntries(nextEntries);
      setStats(nextStats);
      setProfile(nextProfile);
    }).finally(() => setSearching(false));
  }, [query]);
  useEffect(refresh, [refresh]);
  useEvent('history:changed', refresh);
  const dismissBanner = async (key: string) => {
    if (!settings.dismissedBanners.includes(key)) await patch({ dismissedBanners: [...settings.dismissedBanners, key] });
  };
  const visibleBanners = HOME_BANNERS.filter((banner) => !settings.dismissedBanners.includes(banner.key));
  const latestDictation = entries[0] ? new Date(entries[0].timestamp).getTime() : mountedAt;
  const resurrected = settings.postOnboardingCompleted && entries.length > 0 && mountedAt - latestDictation > 30 * 86_400_000 && !welcomeDismissed;
  const completeOnboarding = async (selected: string[]) => {
    await patch({ profile: { typingLocations: selected }, postOnboardingCompleted: true });
  };
  const generateProfile = async () => {
    setProfileBuilding(true);
    try {
      setProfile(await api.stats.generateVoiceProfile());
    } catch (error) {
      toast('Couldn’t generate voice profile', { body: errorMessage(error), tone: 'error' });
    } finally {
      setProfileBuilding(false);
    }
  };
  return (
    <Page wide>
      <div className={s.home}>
        <PageHeader title={<span className={s.homeHeader}>Welcome back{settings.profile.firstName ? `, ${settings.profile.firstName}` : ''}!</span>} />
        <p className={s.returnPrompt}>Hey{settings.profile.firstName ? ` ${settings.profile.firstName}` : ''}, get back into Murmur with <Kbd combo={settings.shortcuts.ptt[0] || 'Ctrl+Win'} />.</p>
        <div className={s.homeGrid}>
          <div className={s.mainColumn}>
            {!settings.dismissedBanners.includes('setup-gate') && settings.onboardingPermissions.some((permission) => permission.name === 'microphone' && !permission.granted) && (
              <section className={s.banner}>
                <div><h2>Complete setup to use dictation</h2><p>Choose a working microphone before you start dictating.</p></div>
                <Button variant="light" size="sm" onClick={() => useHubUi.getState().openSettings('general')}>Complete setup</Button>
                <IconButton label="Close setup reminder" className={s.bannerClose} onClick={() => void dismissBanner('setup-gate')}><X size={18} /></IconButton>
              </section>
            )}
            {visibleBanners.slice(0, 2).map((banner) => (
              <section className={s.banner} key={banner.key}>
                <div><h2>{banner.title}</h2><p>{banner.body}</p></div>
                <Button variant="light" size="sm" onClick={() => {
                  if (banner.key === 'snippets') void api.app.openHub('/snippets');
                  else if (banner.key === 'microphone-quiz') useHubUi.getState().openMicQuiz();
                  else if (banner.key === 'mouse-flow') void api.app.openSettings('dictation');
                  else if (banner.key === 'style') void api.app.openHub('/style');
                  else if (banner.key === 'ide-tagging') void api.app.openSettings('dictation');
                  void dismissBanner(banner.key);
                }}>{banner.action}</Button>
                <IconButton label={`Dismiss ${banner.title}`} className={s.bannerClose} onClick={() => void dismissBanner(banner.key)}><X size={18} /></IconButton>
              </section>
            ))}
            <div className={s.dictationHeading}>
              <span>TODAY&apos;S DICTATIONS</span>
              <div className={s.searchControl}>
                {searchOpen && <SearchInput value={query} onChange={setQuery} placeholder="Search past transcripts" autoFocus />}
                <IconButton label={searchOpen ? 'Close search' : 'Search past transcripts'} onClick={() => { setSearchOpen((open) => !open); if (searchOpen) setQuery(''); }}>
                  {searchOpen ? <X size={18} /> : <Search size={18} />}
                </IconButton>
              </div>
            </div>
            {settings.localDataStorage === 'never_store' ? (
              <div className={s.empty}>
                <EmptyState title="History disabled" body="Murmur is set to never store dictations. Change Local data storage in Settings to keep transcript history." />
              </div>
            ) : searching && query ? (
              <div className={s.empty}><EmptyState title="Searching your history…" /></div>
            ) : entries.length ? (
              <DictationList entries={entries} onChanged={refresh} hideFirstHeading />
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
            <Card className={s.insightsCard} aria-label="Dictation stats and voice profile">
              <div className={s.stats}>
                <div className={s.stat}><strong>{compactNumber(stats?.totalWords ?? 0)}</strong><span>total words</span></div>
                <div className={s.stat}><strong>{stats?.averageWpm ?? 0}</strong><span>wpm</span></div>
                <div className={s.stat}><strong>{stats?.dayStreak ?? 0}</strong><span>day streak</span></div>
                <div className={s.stat}><strong>{stats?.weekStreak ?? 0}</strong><span>week streak</span></div>
              </div>
              <div className={s.voiceProfile}>
                <h2>Your Voice Profile</h2>
                {profile?.status === 'ready' ? (
                  <><p>{profile.headline}</p><Link to="/insights" className={s.sideLink}>View your voice <ArrowRight size={14} /></Link></>
                ) : (stats?.totalWords ?? 0) >= 2_000 ? (
                  <><p>Discover how you use your voice.</p><Button size="sm" variant="outline" loading={profileBuilding} onClick={() => void generateProfile()}>Generate profile</Button></>
                ) : (
                  <><p>Not enough data to refresh your profile. Discover how you use your voice as Murmur learns from locally stored dictations.</p><div className={s.unlockRow}><Progress value={stats ? Math.min(100, stats.totalWords / 20) : 0} /><span>Unlocks in {compactRemaining(profile?.wordsUntilUnlock ?? 2_000)} words</span></div></>
                )}
              </div>
            </Card>
            <Card className={s.insightsCard}>
              <h2>Get back into Murmur</h2>
              {stats?.appsUsed.length ? (
                <p>{stats.appsUsed.slice(0, 3).map((item) => item.app).join(' · ')}</p>
              ) : (
                <p>Start using Murmur in any app to see where your voice saves the most typing.</p>
              )}
            </Card>
            <Link to="/notetaker" className={s.sideLink}>
              <Card className={s.notetakerCard}>
                <div className={s.notetakerArt} aria-hidden="true"><div /><div /><div /></div>
                <h2>Try Notetaker</h2>
                <p>Never miss a detail with accurate transcripts and summaries</p>
              </Card>
            </Link>
          </aside>
        </div>
      </div>
      <Dialog
        open={settings.onboardingComplete && !settings.postOnboardingCompleted}
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
      <Dialog
        open={resurrected}
        onClose={() => setWelcomeDismissed(true)}
        title="Welcome back to Murmur. You’ve been missed!"
        description="A lot has changed. What can Murmur help you with?"
        footer={<Button onClick={() => { setWelcomeDismissed(true); toast('Let’s Murmur!', { body: welcomeHelp || 'Hold your shortcut whenever you’re ready.', tone: 'success' }); }}>Let’s Murmur!</Button>}
      >
        <div className={s.onboardingPills}>
          <Link to="/insights" className={s.usePill} onClick={() => setWelcomeDismissed(true)}><strong>Explore your Voice Profile</strong><span>See patterns from local dictations.</span></Link>
          <Link to="/notetaker" className={s.usePill} onClick={() => setWelcomeDismissed(true)}><strong>Try Notetaker</strong><span>Capture a meeting locally.</span></Link>
        </div>
        <textarea className="m-textarea" aria-label="What can Murmur help with?" placeholder="Tell us what you want to accomplish…" value={welcomeHelp} onChange={(event) => setWelcomeHelp(event.target.value)} />
      </Dialog>
    </Page>
  );
}
