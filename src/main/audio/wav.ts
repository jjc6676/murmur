// PCM16 mono helpers.
export const SAMPLE_RATE = 16000;

export function pcm16ToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Extract raw PCM16 from a canonical WAV produced by pcm16ToWav. */
export function wavToPcm16(wav: Buffer): Buffer {
  const dataIdx = wav.indexOf('data', 12, 'ascii');
  return dataIdx >= 0 ? wav.subarray(dataIdx + 8) : wav.subarray(44);
}

/**
 * Seconds of audio above a speech energy threshold (20ms frames).
 * Used for WPM (speech duration) and to skip ASR on silence.
 */
export function speechSeconds(pcm: Buffer, threshold = 0.012): number {
  const frame = SAMPLE_RATE / 50;
  let voiced = 0;
  for (let off = 0; off + frame * 2 <= pcm.length; off += frame * 2) {
    let sum = 0;
    for (let i = 0; i < frame; i++) {
      const s = pcm.readInt16LE(off + i * 2) / 32768;
      sum += s * s;
    }
    if (Math.sqrt(sum / frame) > threshold) voiced++;
  }
  return voiced / 50;
}

/** Mix two PCM16 streams sample-by-sample (clipped), padding the shorter one with silence. */
export function mixPcm16(a: Buffer, b: Buffer): Buffer {
  const n = Math.max(a.length, b.length) >> 1;
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const s = (i * 2 < a.length ? a.readInt16LE(i * 2) : 0) + (i * 2 < b.length ? b.readInt16LE(i * 2) : 0);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, s)), i * 2);
  }
  return out;
}
