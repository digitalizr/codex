import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './db.mjs';
import { createApi } from './api.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = createStore(process.env.GROCERY_DB_PATH || resolve(root, 'data/household.sqlite'));
const app = express();
const httpServer = createServer(app);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api', createApi(store));
let vite;
if (process.env.NODE_ENV === 'production') {
  const dist = resolve(root, 'dist');
  if (!existsSync(resolve(dist, 'index.html')))
    throw new Error('The application is not built. Run npm run build before npm start.');
  app.use(express.static(dist));
  app.get('/{*splat}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
app.use((error, req, res, next) => {
  console.error('Hearth server error:', error);
  if (!res.headersSent)
    res.status(500).json({ error: 'An unexpected server error occurred.', code: 'SERVER_ERROR' });
  else next(error);
});
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid port number.');
httpServer.listen(port, '0.0.0.0', () =>
  console.log(`Hearth is ready at http://localhost:${port}`),
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  httpServer.close(async () => {
    await vite?.close();
    store.close();
    process.exit(0);
  });
  httpServer.closeIdleConnections();
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
