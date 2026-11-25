import { app } from 'electron';
import { join } from 'node:path';
import { handle } from '../ipc';
import { paths } from '../paths';

export function registerMcp(): void {
  handle('mcp', {
    serverCommand() {
      const script = app.isPackaged ? join(process.resourcesPath, 'murmur-mcp.mjs') : join(app.getAppPath(), 'scripts', 'murmur-mcp.mjs');
      const command = process.execPath;
      const args = [script, paths.db];
      const config = {
        mcpServers: {
          murmur: {
            command,
            args,
            env: { ELECTRON_RUN_AS_NODE: '1' },
          },
        },
      };
      return { command, args, configJson: JSON.stringify(config, null, 2) };
    },
  });
}
