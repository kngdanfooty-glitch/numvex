import { AppError } from './errors.js';

/*
 * Every call to a number provider goes through here. Providers sit behind slow or flaky networks
 * (a plain `fetch failed` / 10s connect timeout used to surface as a 500 while a user waited for a code).
 *  - hard timeout, so a call can never hang forever
 *  - one retry when the connection was never made (the request was NOT sent, so even a purchase is safe to repeat)
 *  - one retry on a timeout/reset for GETs only (a POST may already have been processed: never repeat it)
 *  - anything still failing becomes a clean 502 `provider_unreachable` instead of a crash
 */
const NEVER_SENT = new Set(['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);
const MAYBE_SENT = new Set(['UND_ERR_SOCKET', 'ECONNRESET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

export async function providerFetch(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const isGet = (init.method ?? 'GET').toUpperCase() === 'GET';
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const code = (err as { cause?: { code?: string } }).cause?.code ?? '';
      const timedOut = (err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError';
      const retryable = NEVER_SENT.has(code) || (isGet && (timedOut || MAYBE_SENT.has(code)));
      if (retryable && attempt < 1) continue;
      throw new AppError(502, 'provider_unreachable', 'Could not reach this server. Try again shortly.');
    }
  }
}

/** True for the error above: "the server could not be reached", as opposed to "the server said no". */
export const isUnreachable = (err: unknown) => err instanceof AppError && err.code === 'provider_unreachable';

/** True when the provider said "slow down" (HTTP 429 / RATE_LIMIT_EXCEEDED). `details.retryAfterSec` says for how long, when known. */
export const isBusy = (err: unknown) => err instanceof AppError && err.code === 'server_busy';
export const retryAfterSec = (err: unknown): number | undefined => {
  const v = (err as { details?: { retryAfterSec?: unknown } } | undefined)?.details?.retryAfterSec;
  return typeof v === 'number' && v > 0 ? v : undefined;
};
