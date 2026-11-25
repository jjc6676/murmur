// SCAFFOLD: replaced by its owning slice.
import { createRoot } from 'react-dom/client';
import '../styles/base.css';
import { initSettings } from '../lib/settings';

void initSettings().then(() => createRoot(document.getElementById('root')!).render(<div style={{ padding: 24 }}>recorder</div>));
