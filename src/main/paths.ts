// Filesystem locations. MURMUR_USER_DATA overrides userData (isolated profiles for tests).
import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.MURMUR_USER_DATA) app.setPath('userData', process.env.MURMUR_USER_DATA);

export const paths = {
  get userData(): string {
    return app.getPath('userData');
  },
  get db(): string {
    return join(app.getPath('userData'), 'murmur.sqlite');
  },
  get settings(): string {
    return join(app.getPath('userData'), 'settings.json');
  },
  get audioDir(): string {
    const d = join(app.getPath('userData'), 'audio');
    mkdirSync(d, { recursive: true });
    return d;
  },
  /** Bundled resources: <app>/resources when packaged, <repo>/resources in dev. */
  get resources(): string {
    return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  },
  get whisperBin(): string {
    return join(this.resources, 'whisper', 'bin');
  },
  /** Models: bundled default + user-downloaded models in userData. */
  get bundledModels(): string {
    return join(this.resources, 'whisper', 'models');
  },
  get userModels(): string {
    const d = join(app.getPath('userData'), 'models');
    mkdirSync(d, { recursive: true });
    return d;
  },
  get sounds(): string {
    return join(this.resources, 'sounds');
  },
};
