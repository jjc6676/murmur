import type { StyleContext, StyleTone } from '@shared/types';
import { formatDictation } from '@shared/textPipeline';
import { getCtx } from '../context';
import { handle } from '../ipc';

const CONTEXTS: StyleContext[] = ['work', 'email', 'personal', 'other'];
const TONES: StyleTone[] = ['formal', 'casual', 'very_casual', 'excited', 'gen_z'];

export function registerStyles(): void {
  handle('styles', {
    preview(context, tone, sample) {
      if (!CONTEXTS.includes(context as StyleContext)) throw new Error('Unknown style context');
      if (!TONES.includes(tone as StyleTone)) throw new Error('Unknown style tone');
      const settings = getCtx().settings.get();
      return formatDictation(sample, {
        cleanupLevel: settings.cleanupLevel,
        tone: tone as StyleTone,
        smartFormatting: settings.smartFormatting,
        dictionary: [],
        snippets: [],
        isEmailContext: context === 'email',
        pressEnterCommand: false,
      }).text;
    },
  });
}
