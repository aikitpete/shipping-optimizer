import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { boot } from './bootstrap';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
boot()
  .then((b) => root.render(<StrictMode><App ds={b.ds} snapshot={b.snapshot} storeKind={b.store.kind} /></StrictMode>))
  .catch((e) => { root.render(<pre style={{ padding: 16, whiteSpace: 'pre-wrap' }}>Could not load the data profile.{'\n'}{String(e)}</pre>); });
