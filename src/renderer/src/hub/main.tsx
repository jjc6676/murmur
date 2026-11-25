import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '../styles/base.css';
import { initSettings } from '../lib/settings';
import { App } from './App';

void initSettings().then(() => {
  createRoot(document.getElementById('root')!).render(
    <HashRouter>
      <App />
    </HashRouter>,
  );
});
