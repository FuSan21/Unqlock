import { createRoot } from 'react-dom/client';
import { Prompt } from '@/popup/prompt/Prompt';
import '@/popup/popup.css';
import '@/popup/prompt/prompt.css';

// The prompt window: site access requests and settings file imports the popup cannot run itself.
createRoot(document.getElementById('app')!).render(<Prompt />);
