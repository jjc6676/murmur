// Registers every IPC namespace. Order matters only for features with startup side effects.
import { registerApp } from './app';
import { registerSettings } from './settings';
import { registerHistory } from './history';
import { registerDictation } from './dictation';
import { registerDictionary } from './dictionary';
import { registerTransforms } from './transforms';
import { registerStyles } from './styles';
import { registerNotes } from './notes';
import { registerTodos } from './todos';
import { registerMeetings } from './meetings';
import { registerRecorder } from './recorder';
import { registerStats } from './stats';
import { registerNotifications } from './notifications';
import { registerEngines } from './engines';
import { registerMcp } from './mcp';

export function registerFeatures(): void {
  registerApp();
  registerSettings();
  registerHistory();
  registerDictation();
  registerDictionary();
  registerTransforms();
  registerStyles();
  registerNotes();
  registerTodos();
  registerMeetings();
  registerRecorder();
  registerStats();
  registerNotifications();
  registerEngines();
  registerMcp();
}
