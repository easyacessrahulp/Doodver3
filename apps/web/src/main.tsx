import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';
import { applyAppearance } from './appearance';

// Appearance (theme, density, text size) is applied before anything is drawn.
applyAppearance();

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: false } } });
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></StrictMode>);

// Phone app: works only on a secure (https or localhost) address; on plain http it is skipped quietly.
try {
  if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
    addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); (window as any).__ccInstall = e; dispatchEvent(new Event('cc-installable')); });
  }
} catch { /* ignore */ }
