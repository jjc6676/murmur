// Hub window root: onboarding gate, shell (title bar + sidebar), routes, global dialogs and toasts.
import { Route, Routes, useNavigate } from 'react-router-dom';
import { useEvent } from '../lib/api';
import { useSettings } from '../lib/settings';
import { useHubUi, type SettingsSection } from './state';
import { Shell } from './shell/Shell';
import { Toaster } from './shell/Toaster';
import { Onboarding } from './onboarding/Onboarding';
import { SettingsDialog } from './settings/SettingsDialog';
import { DiffDialog } from './transforms/DiffDialog';
import { HomePage } from './pages/HomePage';
import { HistoryPage } from './pages/HistoryPage';
import { InsightsPage } from './pages/InsightsPage';
import { DictionaryPage } from './pages/DictionaryPage';
import { SnippetsPage } from './pages/SnippetsPage';
import { StylePage } from './pages/StylePage';
import { TransformsPage } from './pages/TransformsPage';
import { ScratchpadPage } from './pages/ScratchpadPage';
import { TasksPage } from './pages/TasksPage';
import { NotetakerPage } from './pages/NotetakerPage';
import { MeetingPage } from './pages/MeetingPage';
import { SkillsPage } from './pages/SkillsPage';
import { MemoryPage } from './pages/MemoryPage';

export function App() {
  const settings = useSettings();
  const navigate = useNavigate();
  const openSettings = useHubUi((s) => s.openSettings);
  const showDiff = useHubUi((s) => s.showDiff);
  useEvent('hub:navigate', ({ route }) => navigate(route));
  useEvent('settings:open', ({ section }) => openSettings((section as SettingsSection | null) ?? 'general'));
  useEvent('diff:show', (d) => showDiff(d));

  if (!settings.onboardingComplete) return <Onboarding />;

  return (
    <>
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/notetaker" element={<NotetakerPage />} />
          <Route path="/notetaker/:id" element={<MeetingPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/dictionary" element={<DictionaryPage />} />
          <Route path="/snippets" element={<SnippetsPage />} />
          <Route path="/style" element={<StylePage />} />
          <Route path="/transforms" element={<TransformsPage />} />
          <Route path="/scratchpad" element={<ScratchpadPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Shell>
      <SettingsDialog />
      <DiffDialog />
      <Toaster />
    </>
  );
}
