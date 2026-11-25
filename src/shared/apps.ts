// Classify the foreground app (process name + window title) into style contexts and usage categories.
import type { AppCategory, StyleContext } from './types';

const BROWSERS = /^(chrome|msedge|firefox|brave|opera|arc|vivaldi|zen|librewolf)$/;

const CATEGORY_RULES: { category: AppCategory; process: RegExp; title?: RegExp }[] = [
  { category: 'ai_prompts', process: /^(cursor|code|windsurf|claude|chatgpt|perplexity|devin|zed|warp|windowsterminal|wt|idea64|pycharm64|webstorm64)$/, title: /(chatgpt|claude|gemini|perplexity|copilot|devin|poe|deepseek|mistral|v0|bolt|lovable|replit)/i },
  { category: 'emails', process: /^(outlook|olk|hxoutlook|thunderbird|mailspring|superhuman|mail)$/, title: /(gmail|outlook|superhuman|proton mail|yahoo mail|inbox)/i },
  { category: 'work_messages', process: /^(slack|teams|ms-teams|discord|mattermost|zoom)$/, title: /(slack|microsoft teams|discord|linear|jira)/i },
  { category: 'personal_messages', process: /^(whatsapp|telegram|signal|messenger|wechat|line|viber)$/, title: /(whatsapp|messenger|telegram|instagram|facebook|imessage|signal)/i },
  { category: 'documents', process: /^(winword|notion|obsidian|onenote|notepad|wordpad|notepad\+\+|typora|evernote|logseq|soffice|excel|powerpnt)$/, title: /(google docs|notion|confluence|dropbox paper|coda|quip)/i },
];

export function categorizeApp(processName: string, title = ''): AppCategory {
  const p = processName.toLowerCase();
  for (const r of CATEGORY_RULES) if (r.process.test(p)) return r.category;
  if (BROWSERS.test(p)) for (const r of CATEGORY_RULES) if (r.title?.test(title)) return r.category;
  return 'other';
}

/** Pick the style context whose app list matches; browsers match by window title keywords. */
export function styleContextFor(processName: string, title: string, styles: Record<StyleContext, { apps: string[] }>): StyleContext {
  const p = processName.toLowerCase();
  const t = title.toLowerCase();
  for (const ctx of ['work', 'email', 'personal'] as const) {
    for (const app of styles[ctx].apps) {
      const a = app.toLowerCase();
      if (p === a || (BROWSERS.test(p) && t.includes(a))) return ctx;
    }
  }
  const cat = categorizeApp(processName, title);
  if (cat === 'emails') return 'email';
  if (cat === 'work_messages') return 'work';
  if (cat === 'personal_messages') return 'personal';
  return 'other';
}

/** Resolve a process-name override, accepting both bare names and .exe forms. */
export function transcriptionFormatForApp(
  processName: string,
  overrides: { app: string; format: 'raw' | 'formatted' }[],
): 'raw' | 'formatted' {
  const normalized = processName.replace(/\.exe$/i, '').toLowerCase();
  return overrides.find((item) => item.app.replace(/\.exe$/i, '').toLowerCase() === normalized)?.format ?? 'formatted';
}

/** Friendly display name for a process ("winword" -> "Word"). */
export function appDisplayName(processName: string): string {
  const map: Record<string, string> = {
    winword: 'Word',
    excel: 'Excel',
    powerpnt: 'PowerPoint',
    msedge: 'Edge',
    chrome: 'Chrome',
    firefox: 'Firefox',
    code: 'VS Code',
    'ms-teams': 'Teams',
    teams: 'Teams',
    olk: 'Outlook',
    hxoutlook: 'Outlook',
    windowsterminal: 'Terminal',
    notepad: 'Notepad',
    explorer: 'Explorer',
    murmur: 'Murmur',
    electron: 'Murmur',
  };
  const p = processName.toLowerCase();
  return map[p] ?? (p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Unknown app');
}

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  ai_prompts: 'AI prompts',
  documents: 'Documents',
  emails: 'Emails',
  personal_messages: 'Personal messages',
  work_messages: 'Work messages',
  other: 'Other tasks',
};
