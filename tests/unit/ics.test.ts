import { describe, expect, it } from 'vitest';
import { parseIcs } from '../../src/main/meetings/ics';

describe('parseIcs', () => {
  it('parses events and expands simple daily and weekly recurrence', () => {
    const calendar = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:daily',
      'SUMMARY:Daily standup',
      'DTSTART:20261125T100000Z',
      'DTEND:20261125T103000Z',
      'RRULE:FREQ=DAILY;COUNT=3',
      'URL:https://meet.example/daily',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:weekly',
      'SUMMARY:Weekly review',
      'DTSTART:20261125T120000Z',
      'DTEND:20261125T130000Z',
      'RRULE:FREQ=WEEKLY;COUNT=2',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = parseIcs(calendar, 'test.ics', new Date('2026-11-25T00:00:00Z'), new Date('2026-12-10T00:00:00Z'));
    expect(events).toHaveLength(5);
    expect(events.filter((event) => event.title === 'Daily standup').map((event) => event.start)).toEqual([
      '2026-11-25T10:00:00.000Z',
      '2026-11-26T10:00:00.000Z',
      '2026-11-27T10:00:00.000Z',
    ]);
    expect(events.find((event) => event.title === 'Daily standup')?.conferenceUrl).toBe('https://meet.example/daily');
    expect(events.filter((event) => event.title === 'Weekly review')).toHaveLength(2);
  });
});
