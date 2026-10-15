// main.tsx — React entry point; mounts <App/> into #root.
//
// exports: none (Vite entry via index.html)
// used_by: src/main.tsx is the only place that imports index.css
// rules:   None
// agent:   claude-code | anthropic | 2026-10-15 | codedna-init | initial CodeDNA annotation

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
