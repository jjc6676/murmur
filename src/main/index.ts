// Murmur main process entry.
import './paths'; // applies MURMUR_USER_DATA before anything reads userData
import { app, desktopCapturer, session } from 'electron';
import { initContext } from './context';
import { registerFeatures } from './features';
import { startAsr } from './features/engines';
import { setupShortcuts } from './shortcuts';
import { createTray } from './tray';
import { ensureCapture, ensureHub, ensureStatus, getWindow } from './windows';

// Chromium switches used by automated tests to feed a WAV file as microphone input.
if (process.env.MURMUR_FAKE_MIC_WAV) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', process.env.MURMUR_FAKE_MIC_WAV);
}
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.setAppUserModelId('com.murmur.app');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => ensureHub(true));

  void app.whenReady().then(() => {
    const ctx = initContext();
    // microphone + system-audio loopback for the hidden capture window
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media' || permission === 'clipboard-read' || permission === 'clipboard-sanitized-write'));
    session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
      // system audio (loopback) for Notetaker; Windows requires a video source alongside, the renderer drops the video track
      void desktopCapturer.getSources({ types: ['screen'] }).then((sources) => cb({ video: sources[0], audio: 'loopback' }));
    });
    registerFeatures();
    setupShortcuts();
    void startAsr();
    ensureCapture();
    const s = ctx.settings.get();
    if (s.showFlowBar && s.onboardingComplete) ensureStatus();
    ctx.settings.onChange((n) => {
      // snooze ("Hide for 1 hour") is handled inside the bar so toasts can still show
      const visible = n.showFlowBar && n.onboardingComplete;
      if (visible) ensureStatus();
      else getWindow('status')?.close();
    });
    createTray();
    const hidden = process.argv.includes('--hidden') || process.env.MURMUR_START_HIDDEN === '1';
    if (!hidden) ensureHub(true);
  });

  app.on('window-all-closed', () => {
    // stay resident in the tray
  });

  app.on('before-quit', () => {
    try {
      // best effort: stop whisper server child process
      initContext().asr.stop();
      initContext().hotkeys.stop();
    } catch {
      // context may not be initialized if quitting during startup
    }
  });
}
