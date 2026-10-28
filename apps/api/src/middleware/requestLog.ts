import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

/*
 * One log line per request, written when the answer has been sent:
 *   [req] POST /api/v1/webhooks/pocketfi 400 12ms hops=2
 * It exists so that "did the call even arrive, and what did we answer?" can be read in the host's logs (Render shows nothing by itself).
 *  - the query string is dropped (it can hold tokens); bodies, cookies and headers are never logged;
 *  - `hops` is how many addresses the proxies put in X-Forwarded-For: it is what TRUST_PROXY has to be measured against;
 *  - webhook calls also log their content type and size, because a body we cannot read is rejected before the webhook code runs;
 *  - /health is skipped (uptime pingers would drown everything else).
 * Off in tests unless LOG_REQUESTS=1.
 */
export const requestLog: RequestHandler = (req, res, next) => {
  if ((env.NODE_ENV === 'test' && process.env.LOG_REQUESTS !== '1') || req.path === '/health') return next();
  const started = Date.now();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0] ?? '';
    const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').filter(Boolean).length;
    const extra = path.startsWith('/api/v1/webhooks') ? ` content-type=${req.headers['content-type'] ?? 'none'} bytes=${req.headers['content-length'] ?? '?'}` : '';
    console.log(`[req] ${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms hops=${hops}${extra}`);
  });
  next();
};
