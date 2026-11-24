import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const target = document.getElementById('app')!;

// Initialize Vercel Web Analytics in production without requiring node_modules/@vercel/analytics locally
if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = '/_vercel/insights/script.js';
  document.head.appendChild(s);
}

try {
  mount(App, { target });
} catch (err) {
  target.innerHTML = `<pre style="padding:24px;font-family:monospace;color:#C74440;background:#FFF5F5;white-space:pre-wrap;">Mount Error: ${
    err instanceof Error ? err.stack || err.message : String(err)
  }</pre>`;
}
