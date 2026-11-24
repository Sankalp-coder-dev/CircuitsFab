import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const target = document.getElementById('app')!;

try {
  mount(App, { target });
} catch (err) {
  target.innerHTML = `<pre style="padding:24px;font-family:monospace;color:#C74440;background:#FFF5F5;white-space:pre-wrap;">Mount Error: ${
    err instanceof Error ? err.stack || err.message : String(err)
  }</pre>`;
}
