import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.ts';
import { apiRouter } from './routes/index.ts';
import { errorHandler, notFoundHandler } from './middleware/errors.ts';
import { logger } from './utils/logger.ts';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'img-src': ["'self'", 'data:', 'https://res.cloudinary.com'], // feed photos on Cloudinary
        },
      },
    })
  );
  // Feed posts can carry a photo (base64, already downscaled by the client); everything else stays small.
  const smallJson = express.json({ limit: '100kb' });
  const feedJson = express.json({ limit: '3mb' });
  app.use((req, res, next) => (req.method === 'POST' && req.path === '/api/feed' ? feedJson : smallJson)(req, res, next));
  app.use(cookieParser());

  app.use((req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
      if (!req.path.startsWith('/api')) return;
      logger.info(`${req.method} ${req.path}`, { status: res.statusCode, ms: Math.round(performance.now() - start) });
    });
    next();
  });

  app.use('/api', apiRouter());
  app.use('/api', notFoundHandler);

  // In production the server also hosts the built React app.
  if (fs.existsSync(env.clientDist)) {
    app.use(express.static(env.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api|\/ws).*/, (_req, res) => res.sendFile(path.join(env.clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
