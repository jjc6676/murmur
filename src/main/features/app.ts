// App-level API: window controls, clipboard, external links, data export/delete, file pickers.
import { app, clipboard, dialog, shell } from 'electron';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { getCtx } from '../context';
import { broadcast, callerWindow, handle } from '../ipc';
import { paths } from '../paths';
import { getForegroundApp } from '../native/win32';
import { ensureHub } from '../windows';
import { addEntry } from './dictionary';
import { rowToHistory, type HistoryRow } from './history';
import { spawnSync } from 'node:child_process';

const DATA_TABLES: Record<string, string[]> = {
  dictation: ['history', 'transform_runs'],
  dictionary: ['dictionary'],
  meetings: ['meetings', 'folder_meetings', 'folders', 'meeting_chat'],
  notes: ['notes', 'note_versions', 'note_images'],
  todos: ['todos'],
  notifications: ['notifications'],
};

function categoriesToTables(categories: string[]): string[] {
  const cats = categories.includes('everything') ? Object.keys(DATA_TABLES) : categories;
  return cats.flatMap((c) => DATA_TABLES[c] ?? []);
}

export function registerApp(): void {
  const { db, settings } = getCtx();
  const purgeExpiredLocalData = (): void => {
    const current = settings.get();
    if (current.localDataStorage === 'auto_delete_24h') {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const changed = db.tx(() => {
        const history = db.run('DELETE FROM history WHERE timestamp < ?', cutoff).changes;
        const transforms = db.run('DELETE FROM transform_runs WHERE createdAt < ?', cutoff).changes;
        return history + transforms;
      });
      if (changed) broadcast('history:changed', { id: null });
    }
    const retentionDays = current.notetaker.transcriptRetentionDays;
    if (retentionDays !== null) {
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
      const changed = db.run("UPDATE meetings SET transcript = '[]', summary = NULL, summaryStatus = 'none', searchable = '' WHERE createdAt < ? AND (transcript != '[]' OR summary IS NOT NULL)", cutoff).changes;
      if (changed) broadcast('meetings:changed', { id: null });
    }
  };
  purgeExpiredLocalData();
  const purgeTimer = setInterval(purgeExpiredLocalData, 60 * 60 * 1000);
  purgeTimer.unref();
  handle('app', {
    getVersion: () => app.getVersion(),
    getPlatformInfo: () => ({ platform: process.platform, arch: process.arch, userData: paths.userData, isPackaged: app.isPackaged }),
    openExternal(url) {
      if (/^(https?|mailto|ms-settings):/i.test(url)) void shell.openExternal(url);
    },
    openPath(p) {
      void shell.openPath(p);
    },
    quit: () => app.quit(),
    restart() {
      app.relaunch();
      app.exit(0);
    },
    resetApp() {
      db.close();
      rmSync(paths.db, { force: true });
      rmSync(`${paths.db}-wal`, { force: true });
      rmSync(`${paths.db}-shm`, { force: true });
      rmSync(paths.audioDir, { recursive: true, force: true });
      app.relaunch();
      app.exit(0);
    },
    openHub(route) {
      const w = ensureHub(true);
      if (route) broadcast('hub:navigate', { route });
      w.focus();
    },
    openSettings(section) {
      ensureHub(true);
      broadcast('settings:open', { section: section ?? null });
    },
    minimizeWindow: () => callerWindow()?.minimize(),
    toggleMaximizeWindow() {
      const w = callerWindow();
      if (!w) return;
      if (w.isMaximized()) w.unmaximize();
      else w.maximize();
    },
    closeWindow: () => callerWindow()?.close(),
    getActiveApp() {
      const f = getForegroundApp();
      return { exe: f.exe, processName: f.processName, title: f.title };
    },
    listRunningApps() {
      // visible top-level apps (process names) for Focus Mode pickers
      const r = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty ProcessName'], { encoding: 'utf8', windowsHide: true });
      return [...new Set((r.stdout ?? '').split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean))].sort();
    },
    copyText: (text) => clipboard.writeText(text),
    readClipboard: () => clipboard.readText(),
    playSound: (name) => broadcast('sound:play', { name }),
    completeOnboarding() {
      settings.patch({ onboardingComplete: true, onboardingStep: 'done' });
    },
    exportData(categories) {
      const tables = categoriesToTables(categories);
      const out: Record<string, unknown[]> = {};
      for (const t of tables) {
        const rows = db.all<Record<string, unknown>>(`SELECT * FROM ${t}`);
        out[t] = t === 'history' ? rows.map((r) => rowToHistory(r as unknown as HistoryRow)) : rows.map((r) => (t === 'note_images' ? { ...r, data: undefined } : r));
      }
      out.settings = [settings.get()];
      const target = dialog.showSaveDialogSync({
        defaultPath: join(app.getPath('documents'), `murmur-export-${new Date().toISOString().slice(0, 10)}.json`),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!target) return '';
      writeFileSync(target, JSON.stringify(out, null, 2));
      return target;
    },
    deleteData(categories) {
      const tables = categoriesToTables(categories);
      db.tx(() => tables.forEach((t) => db.run(`DELETE FROM ${t}`)));
      if (categories.includes('personalization') || categories.includes('everything')) {
        settings.patch({
          personalizationComplete: false,
          writingSamples: [],
          styles: DEFAULT_SETTINGS.styles,
        });
      }
      if (tables.includes('history')) rmSync(paths.audioDir, { recursive: true, force: true });
      for (const ev of ['history:changed', 'notes:changed', 'meetings:changed'] as const) broadcast(ev, { id: null });
      broadcast('dictionary:changed', null);
      broadcast('todos:changed', null);
      broadcast('notifications:changed', null);
    },
    importFile(kind, path) {
      const text = readFileSync(path, 'utf8');
      let imported = 0;
      let skipped = 0;
      const lines: { phrase: string; replacement: string | null }[] = [];
      if (/\.json$/i.test(path)) {
        const data: unknown = JSON.parse(text);
        if (Array.isArray(data))
          for (const item of data) {
            if (typeof item === 'string') lines.push({ phrase: item, replacement: null });
            else if (item && typeof item === 'object' && 'phrase' in item) lines.push({ phrase: String(item.phrase), replacement: 'replacement' in item && item.replacement ? String(item.replacement) : null });
          }
      } else {
        for (const raw of text.split(/\r?\n/)) {
          const line = raw.trim();
          if (!line) continue;
          const m = /^(.*?)(?:\s*(?:->|→|\t|,)\s*)(.+)$/.exec(line);
          lines.push(m ? { phrase: m[1].replace(/^"|"$/g, ''), replacement: m[2].replace(/^"|"$/g, '') } : { phrase: line, replacement: null });
        }
      }
      for (const l of lines) {
        try {
          addEntry({ phrase: l.phrase, replacement: l.replacement, isSnippet: kind === 'snippets', source: 'import' });
          imported++;
        } catch {
          skipped++;
        }
      }
      return { imported, skipped };
    },
    pickFile(filters) {
      const r = dialog.showOpenDialogSync({ properties: ['openFile'], filters });
      return r?.[0] ?? null;
    },
  });
}
