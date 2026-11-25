import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/base.css';
import '../ui/ui.css';
import { initSettings } from '../lib/settings';
import { App } from './App';

void initSettings().then(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
});
