// Read-only Windows permission and locale probes used before opening the microphone.
import { execFile } from 'node:child_process';

const MICROPHONE_KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone`;

export function microphonePrivacyAllowed(timeoutMs = 1500): Promise<boolean | null> {
  const { promise, resolve } = Promise.withResolvers<boolean | null>();
  execFile('reg.exe', ['query', MICROPHONE_KEY, '/v', 'Value'], { windowsHide: true, timeout: timeoutMs }, (error, stdout) => {
    if (error) return resolve(null);
    const value = /Value\s+REG_SZ\s+(\S+)/i.exec(stdout)?.[1]?.toLowerCase();
    resolve(value ? value === 'allow' : null);
  });
  return promise;
}

export function windowsRegion(): string {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return /-([A-Z]{2})(?:-|$)/i.exec(locale)?.[1]?.toUpperCase() ?? '';
}
