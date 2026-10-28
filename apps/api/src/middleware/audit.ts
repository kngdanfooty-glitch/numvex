import type { Request, RequestHandler } from 'express';
import { AdminAction } from '../models/AdminAction.js';

/*
 * Wrap a write route so every successful call is recorded in the audit log, automatically (the idea FloZap uses): who, what,
 * which module, what they sent (passwords/tokens/secrets blanked out) and from which address. A failed call is not recorded.
 * Money actions that already write their own detailed row (amount, reason) do not use this.
 */
const SECRET_FIELDS = ['password', 'pin', 'token', 'secret', 'apiKey', 'api_key', 'key'];
const redact = (body: unknown): Record<string, unknown> | undefined => {
  if (!body || typeof body !== 'object') return undefined;
  const clean: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const f of SECRET_FIELDS) if (f in clean) clean[f] = '[hidden]';
  return clean;
};

export const audit = (action: string, module: string, target: (req: Request) => string | undefined = (req) => (typeof req.params?.id === 'string' ? req.params.id : undefined)): RequestHandler => (req, res, next) => {
  const original = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 400) {
      AdminAction.create({
        adminId: res.locals.userId,
        adminEmail: res.locals.admin?.email,
        module,
        action,
        targetRef: target(req),
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        details: redact(req.body),
        ip: req.ip,
      }).catch((err) => console.error('[audit] could not record:', action, (err as Error).message));
    }
    return original(body);
  };
  next();
};
