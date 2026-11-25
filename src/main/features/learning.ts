// Auto-add to dictionary: after a paste, re-read the field and learn words the user corrected.
import { learnCorrections } from '@shared/learn';
import { getCtx } from '../context';
import { broadcast } from '../ipc';
import { getForegroundApp, type ForegroundApp } from '../native/win32';
import { readFocusedText } from '../native/uia';
import { showToast } from '../toasts';
import { addEntry } from './dictionary';

const CHECK_AFTER_MS = [8_000, 20_000];

export function scheduleEditLearning(historyId: string, pastedText: string, target: ForegroundApp): void {
  let done = false;
  for (const delay of CHECK_AFTER_MS) {
    setTimeout(() => {
      if (done) return;
      void check().then((learned) => {
        if (learned) done = true;
      });
    }, delay);
  }

  async function check(): Promise<boolean> {
    const fg = getForegroundApp();
    if (fg.hwnd !== target.hwnd) return false;
    const field = await readFocusedText();
    if (!field.ok || !field.value) return false;
    const { edited, corrections } = learnCorrections(pastedText, field.value);
    if (!edited) return false;
    const editedText = edited.join(' ');
    getCtx().db.run('UPDATE history SET editedText = ? WHERE id = ?', editedText, historyId);
    broadcast('history:changed', { id: historyId });
    const added: { id: string; to: string }[] = [];
    for (const c of corrections) {
      try {
        const { entry } = addEntry({ phrase: c.from, replacement: c.to, isSnippet: false, source: 'auto' });
        added.push({ id: entry.id, to: c.to });
      } catch {
        // already known
      }
    }
    if (added.length) {
      showToast(
        { key: 'LearnedDictionaryWords', title: `Added ${added.map((a) => `"${a.to}"`).join(', ')} to your Dictionary`, target: 'bar', actions: [{ id: 'undo', label: 'Undo' }], durationMs: 7000 },
        (a) => {
          if (a !== 'undo') return;
          for (const x of added) getCtx().db.run('DELETE FROM dictionary WHERE id = ?', x.id);
          broadcast('dictionary:changed', null);
        },
      );
    }
    return corrections.length > 0;
  }
}
