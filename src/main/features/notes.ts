// Scratchpad notes. (Implementation owned by the Scratchpad slice.)
import { broadcast } from '../ipc';
import { ensureScratchpad } from '../windows';

export function openScratchpad(noteId?: string): void {
  ensureScratchpad(true);
  broadcast('scratchpad:open', { noteId: noteId ?? null });
}

export function registerNotes(): void {}
