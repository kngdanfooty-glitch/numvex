import type { ErrorResponse } from '@numvexs/shared';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, body: ErrorResponse['error'] | { message?: string }) {
    super(body.message ?? 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = 'code' in body && body.code ? body.code : 'error';
    this.details = 'details' in body ? body.details : undefined;
  }
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface RawResult {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
  json: unknown;
}

async function rawFetch(path: string, opts: ApiOptions): Promise<RawResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    cache: 'no-store',
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    text,
    json: text ? safeJson(text) : undefined,
  };
}

/** Endpoints where a 401 is a real answer, not an expired access token. */
const NO_REFRESH = new Set([
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/refresh',
  '/v1/auth/logout',
  '/v1/auth/verify-email',
  '/v1/auth/2fa/verify',
  '/v1/auth/reset-password',
]);

/** One shared refresh in flight, so a burst of 401s triggers a single call. */
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= rawFetch('/v1/auth/refresh', { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  let res: RawResult;
  try {
    res = await rawFetch(path, opts);
  } catch {
    throw new ApiError(0, { message: 'Cannot reach the server. Check your connection.' });
  }

  const canRefresh = !opts.headers?.cookie && !NO_REFRESH.has(path);
  if (res.status === 401 && canRefresh && (await refreshSession())) {
    res = await rawFetch(path, opts);
  }

  if (!res.ok) {
    const errBody =
      res.json && typeof res.json === 'object' && 'error' in res.json
        ? (res.json as ErrorResponse).error
        : { message: res.text ? 'Something went wrong. Please try again.' : res.statusText };
    throw new ApiError(res.status, errBody);
  }

  return res.json as T;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
