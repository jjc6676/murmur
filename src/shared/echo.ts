// Echo suppression for meeting transcripts: without headphones the microphone also hears the speakers,
// so remote speech shows up twice (once on system audio, once on the mic). A mic ("you") segment that
// overlaps in time with a system-audio segment and mostly repeats its words is an echo, not the user.

const ECHO_WINDOW_SEC = 3;
const ECHO_SIMILARITY = 0.6;

interface TimedText {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** Share of the mic segment's words that also appear in the remote text (0..1). */
export function echoSimilarity(micText: string, remoteText: string): number {
  const mic = words(micText);
  if (!mic.length) return 0;
  const remote = new Set(words(remoteText));
  return mic.filter((word) => remote.has(word)).length / mic.length;
}

/** True when `segment` (from the mic) is an acoustic echo of overlapping remote segments. */
export function isEcho(segment: TimedText, remote: readonly TimedText[]): boolean {
  if (segment.speaker !== 'you') return false;
  const nearby = remote.filter(
    (other) => other.speaker !== 'you' && other.start <= segment.end + ECHO_WINDOW_SEC && other.end >= segment.start - ECHO_WINDOW_SEC,
  );
  if (!nearby.length) return false;
  return echoSimilarity(segment.text, nearby.map((other) => other.text).join(' ')) >= ECHO_SIMILARITY;
}

/** Drop mic segments that are echoes of remote speech; remote segments are always kept. */
export function dropEchoSegments<T extends TimedText>(segments: readonly T[]): T[] {
  const remote = segments.filter((segment) => segment.speaker !== 'you');
  return segments.filter((segment) => !isEcho(segment, remote));
}
