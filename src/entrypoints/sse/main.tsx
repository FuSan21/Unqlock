import { createRoot } from 'react-dom/client';
import { Debugger } from '@/popup/sse/Debugger';
import '@/popup/sse/sse.css';

// The Unqlock SSE debugger window, opened by the background for one builder tab (src/lib/sse-debugger.ts).
createRoot(document.getElementById('app')!).render(<Debugger />);
