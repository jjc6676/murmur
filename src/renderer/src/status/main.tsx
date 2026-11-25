import { createRoot } from 'react-dom/client';
import '../styles/base.css';
import { initSettings } from '../lib/settings';
import { FlowBar } from './FlowBar';

document.documentElement.style.background = 'transparent';
document.body.style.background = 'transparent';

void initSettings().then(() => createRoot(document.getElementById('root')!).render(<FlowBar />));
