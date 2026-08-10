import express from 'express';
import path from 'path';
import { app } from './src/server/app.js';

const port = 3000;

async function startServer() {
  // For development, we'll use Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files
    const clientPath = path.join(process.cwd(), 'dist/client');
    app.use(express.static(clientPath));

    // SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
