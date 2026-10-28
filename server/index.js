import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { PORT, APP_URL, ROOT } from './config.js';
import './db.js';
import { HttpError } from './http.js';
import { authRouter, requireAuth } from './auth.js';
import { accountsRouter } from './routes/accounts.js';
import { contactsRouter, listsRouter } from './routes/contacts.js';
import { templatesRouter } from './routes/templates.js';
import { campaignsRouter } from './routes/campaigns.js';
import { statsRouter, suppressionsRouter, settingsRouter } from './routes/misc.js';
import { trackingRouter } from './routes/tracking.js';
import { startEngine } from './engine/sender.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(trackingRouter);

const api = express.Router();
api.use(express.json({ limit: '25mb' }));
api.use('/auth', authRouter);
api.use(requireAuth);
api.use('/accounts', accountsRouter);
api.use('/contacts', contactsRouter);
api.use('/lists', listsRouter);
api.use('/templates', templatesRouter);
api.use('/campaigns', campaignsRouter);
api.use('/stats', statsRouter);
api.use('/suppressions', suppressionsRouter);
api.use('/settings', settingsRouter);
api.get('/meta', (_req, res) => res.json({ app_url: APP_URL }));
api.use((_req, _res, next) => next(new HttpError(404, 'Not found.')));
app.use('/api', api);

// Serve the built UI in production.
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Check the server log.' : err.message });
});

app.listen(PORT, () => {
  console.log(`allmail API on http://localhost:${PORT}  (public URL for tracking: ${APP_URL})`);
  startEngine();
});
