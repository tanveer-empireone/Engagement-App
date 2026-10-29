import 'dotenv/config';
import http from 'http';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { createProductionApp } from './src/server/productionApp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Refusing to start without a database.');
  process.exit(1);
}

const app = await createProductionApp();
const server = http.createServer(app);

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(dist, 'index.html'));
  });
} else if (!process.env.VERCEL) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: { server } },
    appType: 'spa'
  });
  app.use(vite.middlewares);
}

server.keepAliveTimeout = 0;
server.headersTimeout = 65_000;
server.on('clientError', (err, socket) => {
  console.error('HTTP client error:', err.message);
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

if (!process.env.VERCEL) {
  server.listen(PORT, '::', () => {
    console.log(`E1 Server listening on port ${PORT}`);
  });
}

export default app;
