import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import bookingsRouter from './routes/bookings.js';
import resourcesRouter from './routes/resources.js';
import { statsRouter, ticketsRouter } from './routes/tickets.js';
import { errorHandler, notFoundHandler } from './utils/errors.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // correct client IP behind the host's proxy
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/resources', resourcesRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
