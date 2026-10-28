import express, { type Application, type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { env } from './config/env.js';
import { AppError } from './lib/errors.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requestLog } from './middleware/requestLog.js';
import authRoutes from './routes/auth.routes.js';
import boostRoutes from './routes/boost.routes.js';
import esimRoutes from './routes/esim.routes.js';
import rentalsRoutes from './routes/rentals.routes.js';
import telegramRoutes from './routes/telegram.routes.js';
import numbersRoutes from './routes/numbers.routes.js';
import adminRoutes from './routes/admin.routes.js';
import historyRoutes from './routes/history.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';

export function buildApp(): Application {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY); // how many reverse proxies are in front of us (see TRUST_PROXY in env.ts), so rate limits see the real IP
  app.disable('x-powered-by');
  app.use(requestLog); // first, so even calls refused by the body parser or an earlier layer are logged

  app.use(helmet()); // sensible security headers
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true })); // only our web app may call us, with cookies
  // read JSON bodies (and refuse huge ones). The raw bytes are kept too: webhook signatures are checked against them.
  app.use(express.json({ limit: '10kb', verify: (req, _res, buf) => { (req as unknown as { rawBody?: Buffer }).rawBody = buf; } }));
  app.use(cookieParser()); // read cookies

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // A ceiling on every call from one IP. PocketFi's webhook is left out: it comes from their servers and must never be turned away.
  app.use('/api/v1', (req, res, next) => (req.path.startsWith('/webhooks') ? next() : apiLimiter(req, res, next)));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/numbers', numbersRoutes);
  app.use('/api/v1/boost', boostRoutes);
  app.use('/api/v1/esim', esimRoutes);
  app.use('/api/v1/rentals', rentalsRoutes);
  app.use('/api/v1/telegram', telegramRoutes);
  app.use('/api/v1/wallet', walletRoutes);
  app.use('/api/v1/history', historyRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/webhooks', webhooksRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' } });
  });

  app.use(errorHandler);
  return app;
}

/*
 * The ONE place errors become HTTP responses, always in the shape
 * { error: { code, message, details? } }.
 */
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // 1. Request failed Zod validation -> 400, with the message the user should see
  if (err instanceof z.ZodError) {
    const message = err.issues[0]?.message ?? 'Invalid request.';
    res.status(400).json({
      error: { code: 'validation_error', message, details: z.flattenError(err).fieldErrors },
    });
    return;
  }

  // 2. An error we threw on purpose (wrong password, code expired...)
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  // 3. Two people registering the same email at the exact same moment (MongoDB unique index)
  if (err?.code === 11000) {
    res.status(409).json({ error: { code: 'already_exists', message: 'That account already exists.' } });
    return;
  }

  // 4. Malformed JSON body
  if (err?.type === 'entity.parse.failed') {
    console.error(`[req] ${req.method} ${req.originalUrl.split('?')[0]}: the body is not valid JSON`);
    res.status(400).json({ error: { code: 'bad_json', message: 'Request body is not valid JSON.' } });
    return;
  }

  // 5. A real bug. Log it for us, but never leak details to the client.
  console.error(err);
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong.' } });
};
