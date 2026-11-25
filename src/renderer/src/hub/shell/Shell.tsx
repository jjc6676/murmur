// Hub frame: custom title bar, collapsible sidebar, content area.
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  BookText,
  Brain,
  CircleDot,
  CircleHelp,
  CircleUserRound,
  Gift,
  LayoutGrid,
  ListTodo,
  Minus,
  Moon,
  Plug,
  PanelLeft,
  Scissors,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  StickyNote,
  Sun,
  Type,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import { api, useEvent } from '../../lib/api';
import { usePatchSettings, useSettings } from '../../lib/settings';
import { Badge, CountBadge, IconButton, cx } from '../../ui';
import { toast, useHubUi } from '../state';
import { Logo } from './Logo';
import { AccountMenu } from './AccountMenu';
import { HelpMenu } from './HelpMenu';
import { NotificationCenter } from './NotificationCenter';
import { InviteTeamDialog, ReferralDialog, UpgradeDialog } from './CloudDialogs';
import { NotetakerChecklist } from './NotetakerChecklist';
import s from './Shell.module.css';

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: 'Home', icon: <LayoutGrid size={18} /> },
  { to: '/notetaker', label: 'Notetaker', icon: <CircleDot size={18} /> },
  { to: '/insights', label: 'Insights', icon: <BarChart3 size={18} /> },
  { to: '/dictionary', label: 'Dictionary', icon: <BookText size={18} /> },
  { to: '/snippets', label: 'Snippets', icon: <Scissors size={18} /> },
  { to: '/style', label: 'Style', icon: <Type size={18} /> },
  { to: '/style', label: 'My Voice', icon: <CircleUserRound size={18} /> },
  { to: '/transforms', label: 'Transforms', icon: <WandSparkles size={18} /> },
  { to: '/scratchpad', label: 'Scratchpad', icon: <StickyNote size={18} /> },
  { to: '/tasks', label: 'My Tasks', icon: <ListTodo size={18} /> },
  { to: '/skills', label: 'Skills', icon: <Sparkles size={18} /> },
  { to: '/memory', label: 'Memory', icon: <Brain size={18} /> },
];

function TitleBar({ onToggleSidebar, onUpgrade }: { onToggleSidebar: () => void; onUpgrade: () => void }) {
  const settings = useSettings();
  const patch = usePatchSettings();
  const setNotificationsOpen = useHubUi((st) => st.setNotificationsOpen);
  const [unread, setUnread] = useState(0);
  const refresh = () => void api.notifications.unreadCount().then(setUnread);
  useEvent('notifications:changed', refresh);
  useEffect(() => {
    void api.notifications.unreadCount().then(setUnread);
  }, []);
  const dark = document.documentElement.dataset.theme === 'dark';
  return (
    <div className={cx(s.titlebar, 'drag')}>
      <div className={cx(s.titleLeft, 'no-drag')}>
        <IconButton label="Toggle sidebar" onClick={onToggleSidebar}>
          <PanelLeft size={18} />
        </IconButton>
        <AccountMenu
          trigger={(p) => (
            <IconButton label="Account" {...p}>
              {settings.profile.avatarDataUrl ? <img src={settings.profile.avatarDataUrl} alt="" className={s.avatar} /> : <CircleUserRound size={18} />}
            </IconButton>
          )}
        />
      </div>
      <div className={cx(s.titleRight, 'no-drag')}>
        <button type="button" className={s.upgrade} onClick={onUpgrade}>
          Get unlimited access
        </button>
        <IconButton label="Theme" onClick={() => void patch({ theme: dark ? 'light' : 'dark' })}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
        <span className={s.bellWrap}>
          <IconButton label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setNotificationsOpen(true)}>
            <Bell size={18} />
          </IconButton>
          {unread > 0 && <span className={s.bellDot}>{unread > 9 ? '9+' : unread}</span>}
        </span>
        <div className={s.winControls}>
          <button type="button" aria-label="Minimize" onClick={() => void api.app.minimizeWindow()}>
            <Minus size={14} />
          </button>
          <button type="button" aria-label="Maximize" onClick={() => void api.app.toggleMaximizeWindow()}>
            <Square size={11} />
          </button>
          <button type="button" aria-label="Close" className={s.close} onClick={() => void api.app.closeWindow()}>
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const patch = usePatchSettings();
  const openSettings = useHubUi((st) => st.openSettings);
  const navigate = useNavigate();
  const location = useLocation();
  const [dialog, setDialog] = useState<null | 'invite' | 'referral' | 'upgrade'>(null);
  const open = settings.sidebarOpen;
  const settingsAttention = settings.llm.provider === 'none' ? 1 : 0;
  return (
    <div className={s.frame}>
      <TitleBar onToggleSidebar={() => void patch({ sidebarOpen: !open })} onUpgrade={() => setDialog('upgrade')} />
      <aside className={cx(s.sidebar, !open && s.sidebarClosed)} aria-hidden={!open}>
        <button type="button" className={s.logo} onClick={() => navigate('/')} aria-label="Murmur home">
          <Logo />
        </button>
        <div className={s.sidebarScroll}>
        <nav aria-label="Main navigation" className={s.nav}>
          {NAV.map((n) => (
            <NavLink
              key={n.label}
              to={n.to}
              end={n.to === '/'}
              onClick={() => {
                if (n.label === 'Insights' && !settings.nudges['insights-nav']) {
                  void patch({ nudges: { 'insights-nav': { lastShown: Date.now(), count: 1 } } });
                }
              }}
              className={({ isActive }) => cx(s.navItem, (isActive || (n.to === '/notetaker' && location.pathname.startsWith('/notetaker'))) && s.navActive)}
            >
              {n.icon}
              <span>{n.label}</span>
              {n.label === 'Insights' && !settings.nudges['insights-nav'] && <span aria-hidden="true"><Badge tone="accent">NEW</Badge></span>}
            </NavLink>
          ))}
          <button type="button" className={s.navItem} onClick={() => toast('Murmur runs fully offline', { body: 'Online account extensions are not available.', tone: 'info' })}>
            <Plug size={18} />
            <span>Extensions</span>
          </button>
        </nav>
        <div className={s.spacer} />
        <NotetakerChecklist />
        </div>
        <div className={s.divider} />
        <nav aria-label="Secondary navigation" className={s.nav}>
          <button type="button" className={s.navItem} onClick={() => setDialog('invite')}>
            <Users size={18} />
            <span>Invite your team</span>
          </button>
          <button type="button" className={s.navItem} onClick={() => setDialog('referral')}>
            <Gift size={18} />
            <span>Get a free month</span>
          </button>
          <button type="button" className={s.navItem} onClick={() => openSettings('general')}>
            <SettingsIcon size={18} />
            <span>Settings</span>
            <CountBadge n={settingsAttention} label="Needs attention" />
          </button>
          <HelpMenu
            trigger={(p) => (
              <button type="button" className={s.navItem} {...p}>
                <CircleHelp size={18} />
                <span>Help</span>
              </button>
            )}
          />
        </nav>
      </aside>
      <main className={cx(s.content, !open && s.contentFull)}>{children}</main>
      <NotificationCenter />
      <InviteTeamDialog open={dialog === 'invite'} onClose={() => setDialog(null)} />
      <ReferralDialog open={dialog === 'referral'} onClose={() => setDialog(null)} />
      <UpgradeDialog open={dialog === 'upgrade'} onClose={() => setDialog(null)} />
    </div>
  );
}
