import express from 'express';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { errorHandler, notFound } from './middleware/errors.js';

export function createApp({ logging = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  // Logs en JSON por stdout: listos para un futuro stack ELK.
  if (logging) app.use(pinoHttp({ level: config.logLevel, redact: ['req.headers.authorization'] }));

  app.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ service: 'user-service', status: dbUp ? 'ok' : 'degraded', db: dbUp });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
