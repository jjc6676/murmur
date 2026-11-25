import type { CalendarEvent } from '@shared/types';

interface RawEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  url: string | null;
  rrule: Record<string, string> | null;
}

function parseDate(value: string): Date {
  if (/^\d{8}$/.test(value)) return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00`);
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) throw new Error(`Unsupported ICS date: ${value}`);
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7] ? 'Z' : ''}`;
  return new Date(iso);
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseRule(value: string): Record<string, string> {
  return Object.fromEntries(value.split(';').map((part) => {
    const [key, entry = ''] = part.split('=', 2);
    return [key.toUpperCase(), entry];
  }));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function expand(event: RawEvent, rangeStart: Date, rangeEnd: Date): RawEvent[] {
  if (!event.rrule) return event.end >= rangeStart && event.start <= rangeEnd ? [event] : [];
  const frequency = event.rrule.FREQ;
  if (frequency !== 'DAILY' && frequency !== 'WEEKLY') return [];
  const stepDays = (frequency === 'WEEKLY' ? 7 : 1) * Math.max(1, Number(event.rrule.INTERVAL ?? 1));
  const count = Math.max(1, Math.min(Number(event.rrule.COUNT ?? 1000), 1000));
  const until = event.rrule.UNTIL ? parseDate(event.rrule.UNTIL) : rangeEnd;
  const duration = event.end.getTime() - event.start.getTime();
  const occurrences: RawEvent[] = [];
  for (let index = 0, start = event.start; index < count && start <= until && start <= rangeEnd; index++, start = addDays(start, stepDays)) {
    const end = new Date(start.getTime() + duration);
    if (end >= rangeStart) occurrences.push({ ...event, uid: `${event.uid}:${start.toISOString()}`, start, end, rrule: null });
  }
  return occurrences;
}

export function parseIcs(text: string, source = 'Calendar', rangeStart = new Date(), rangeEnd = addDays(new Date(), 60)): CalendarEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const events: RawEvent[] = [];
  for (const block of blocks) {
    const fields = new Map<string, string>();
    for (const line of block.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      fields.set(line.slice(0, colon).split(';')[0].toUpperCase(), line.slice(colon + 1));
    }
    const startValue = fields.get('DTSTART');
    if (!startValue) continue;
    const start = parseDate(startValue);
    const end = fields.has('DTEND') ? parseDate(fields.get('DTEND')!) : new Date(start.getTime() + 60 * 60 * 1000);
    events.push({
      uid: fields.get('UID') ?? `${source}:${start.toISOString()}`,
      title: unescapeText(fields.get('SUMMARY') ?? 'Untitled meeting'),
      start,
      end,
      url: fields.get('URL') ?? fields.get('CONFERENCE') ?? null,
      rrule: fields.has('RRULE') ? parseRule(fields.get('RRULE')!) : null,
    });
  }
  return events.flatMap((event) => expand(event, rangeStart, rangeEnd)).map((event) => ({ id: event.uid, title: event.title, start: event.start.toISOString(), end: event.end.toISOString(), conferenceUrl: event.url, source })).sort((a, b) => a.start.localeCompare(b.start));
}
