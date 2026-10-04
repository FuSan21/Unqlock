import { createRoot } from 'react-dom/client';
import { App } from '@/popup/App';
import '@/popup/popup.css';

// The same page serves the toolbar popup, the floating menu's frame and detached windows.
createRoot(document.getElementById('app')!).render(<App />);
