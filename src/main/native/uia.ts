// Reads the focused text field via Windows UI Automation using a long-lived PowerShell helper
// (the equivalent of Flow's accessibility helper). Used for context awareness and learning from edits.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $out = @{ ok = $false; value = ''; name = ''; control = '' }
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($el) {
      $out.name = $el.Current.Name
      $out.control = $el.Current.ControlType.ProgrammaticName
      $p = $null
      if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$p)) {
        $out.value = $p.DocumentRange.GetText(20000); $out.ok = $true
      } elseif ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) {
        $out.value = $p.Current.Value; $out.ok = $true
      }
    }
  } catch { $out.error = $_.Exception.Message }
  [Console]::Out.WriteLine((ConvertTo-Json $out -Compress))
}
`;

export interface FocusedText {
  ok: boolean;
  value: string;
  name: string;
  control: string;
}

let proc: ChildProcessWithoutNullStreams | null = null;
let buffer = '';
const waiters: ((line: string) => void)[] = [];

function ensure(): ChildProcessWithoutNullStreams {
  if (proc && proc.exitCode === null) return proc;
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: 'pipe' });
  p.stdout.setEncoding('utf8').on('data', (d: string) => {
    buffer += d;
    let i: number;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line.startsWith('{')) waiters.shift()?.(line);
    }
  });
  p.on('exit', () => {
    proc = null;
    while (waiters.length) waiters.shift()?.('{"ok":false,"value":"","name":"","control":""}');
  });
  proc = p;
  return p;
}

/** Read the focused element's text (≤20k chars). Resolves with ok:false on timeout or unsupported controls. */
export function readFocusedText(timeoutMs = 1500): Promise<FocusedText> {
  const p = ensure();
  const { promise, resolve } = Promise.withResolvers<FocusedText>();
  const timer = setTimeout(() => {
    const idx = waiters.indexOf(onLine);
    if (idx >= 0) waiters.splice(idx, 1);
    resolve({ ok: false, value: '', name: '', control: '' });
  }, timeoutMs);
  function onLine(line: string) {
    clearTimeout(timer);
    try {
      const v: unknown = JSON.parse(line);
      if (v && typeof v === 'object' && 'ok' in v)
        resolve({
          ok: v.ok === true,
          value: 'value' in v && typeof v.value === 'string' ? v.value : '',
          name: 'name' in v && typeof v.name === 'string' ? v.name : '',
          control: 'control' in v && typeof v.control === 'string' ? v.control : '',
        });
      else resolve({ ok: false, value: '', name: '', control: '' });
    } catch {
      resolve({ ok: false, value: '', name: '', control: '' });
    }
  }
  waiters.push(onLine);
  p.stdin.write('read\n');
  return promise;
}

export function stopUia(): void {
  proc?.kill();
  proc = null;
}
