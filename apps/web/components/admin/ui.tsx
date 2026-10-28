'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatNaira, type DayPoint } from '@numvexs/shared';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

/* Small building blocks shared by every admin page, so they all look and behave the same. */

export const errorOf = (e: unknown, fallback = 'Something went wrong. Try again.') => (e instanceof ApiError && e.message ? e.message : fallback);
export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const FIELD = 'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-accent disabled:opacity-60';
export const BTN = 'inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
export const BTN_PRIMARY = cn(BTN, 'bg-accent text-white hover:brightness-110');
export const BTN_GHOST = cn(BTN, 'border border-border bg-surface hover:bg-surface-2');
export const BTN_DANGER = cn(BTN, 'bg-danger text-white hover:brightness-110');

export function PageHeader({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="section-kicker text-2xl font-extrabold">{title}</h1>
        {hint ? <p className="mt-1 max-w-2xl text-sm text-muted">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Card({ title, hint, right, children, className }: { title?: string; hint?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border bg-surface p-4', className)}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold">{title}</h2>
            {hint ? <p className="mt-0.5 max-w-3xl text-xs text-muted">{hint}</p> : null}
          </div>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'ok' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-bold uppercase tracking-[0.04em] text-faint">{label}</p>
      <p className={cn('mt-1.5 text-2xl font-extrabold', tone === 'warn' ? 'text-danger' : tone === 'ok' ? 'text-success' : '')}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

export function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' | 'ok' }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={cn('text-sm', tone === 'error' ? 'text-danger' : tone === 'ok' ? 'text-success' : 'text-muted')}>
      {children}
    </p>
  );
}

const BADGES: Record<string, string> = {
  active: 'bg-success/10 text-success',
  completed: 'bg-success/10 text-success',
  delivered: 'bg-success/10 text-success',
  credited: 'bg-success/10 text-success',
  suspended: 'bg-danger/10 text-danger',
  failed: 'bg-danger/10 text-danger',
  canceled: 'bg-danger/10 text-danger',
  cancelled: 'bg-danger/10 text-danger',
  unmatched: 'bg-danger/10 text-danger',
  review: 'bg-accent-soft text-accent',
  verified: 'bg-success/10 text-success',
  'not verified': 'bg-danger/10 text-danger',
};
export function Badge({ children }: { children: string }) {
  return <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize', BADGES[children] ?? 'bg-surface-2 text-muted')}>{children.replace(/_/g, ' ')}</span>;
}

/** A plain table that scrolls sideways on a phone. */
export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-[0.04em] text-faint">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3.5 py-2.5 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
      {rows === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">{empty ?? 'Nothing to show.'}</p> : null}
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn('px-3.5 py-2.5 align-top', className)}>{children}</td>;

export function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <span>
        {total.toLocaleString()} result{total === 1 ? '' : 's'} · page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button className={BTN_GHOST} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className={BTN_GHOST} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

/** Tabs that look like the rest of the app. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1.5 rounded-xl border border-border bg-surface p-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('h-9 flex-1 rounded-lg px-3 text-sm font-bold transition-colors', value === o.id ? 'bg-accent text-white' : 'text-muted hover:bg-surface-2')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Money with its sign: +₦500 / −₦200. */
export const Signed = ({ kobo }: { kobo: number }) => <span className={cn('font-bold', kobo > 0 ? 'text-success' : '')}>{kobo > 0 ? '+' : kobo < 0 ? '−' : ''}{formatNaira(Math.abs(kobo))}</span>;

/**
 * Any action that changes something asks for a reason first, then asks again ("Confirm"). Nothing is sent until the second click.
 * `describe` is the plain sentence shown at the confirm step, e.g. "Suspend ada@example.com?".
 */
export function ReasonConfirm({ label, describe, pending, error, onConfirm, danger, disabled }: { label: string; describe: ReactNode; pending: boolean; error?: ReactNode; onConfirm: (reason: string) => void; danger?: boolean; disabled?: boolean }) {
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  // When an action finishes, close the confirm step so it can never be sent twice by accident: a success also clears the reason,
  // a failure keeps it (the error is shown) so the person can fix the problem and try again.
  const wasPending = useRef(false);
  const hasError = !!error;
  useEffect(() => {
    if (wasPending.current && !pending) {
      setConfirming(false);
      if (!hasError) setReason('');
    }
    wasPending.current = pending;
  }, [pending, hasError]);
  return (
    <div className="space-y-2">
      <input className={FIELD} placeholder="Reason (required, kept in the audit log)" value={reason} onChange={(e) => { setReason(e.target.value); setConfirming(false); }} />
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{describe}</span>
          <button className={danger ? BTN_DANGER : BTN_PRIMARY} disabled={pending} onClick={() => onConfirm(reason.trim())}>
            {pending ? 'Working…' : 'Confirm'}
          </button>
          <button className={BTN_GHOST} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className={danger ? BTN_DANGER : BTN_PRIMARY} disabled={disabled || reason.trim().length < 3} onClick={() => setConfirming(true)}>
          {label}
        </button>
      )}
      {error ? <Note tone="error">{error}</Note> : null}
    </div>
  );
}

/** A small bar chart drawn with plain SVG (no chart library needed). */
export function BarChart({ points, format, color = 'var(--accent)' }: { points: DayPoint[]; format: (v: number) => string; color?: string }) {
  const max = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  const W = 560;
  const H = 120;
  const gap = 6;
  const bar = (W - gap * (points.length - 1)) / points.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Daily chart">
        {points.map((p, i) => {
          const h = Math.max(2, (Math.abs(p.value) / max) * H);
          const x = i * (bar + gap);
          return (
            <g key={p.day}>
              <title>{`${p.day}: ${format(p.value)}`}</title>
              <rect x={x} y={H - h} width={bar} height={h} rx={3} fill={p.value < 0 ? 'var(--danger)' : color} opacity={p.value === 0 ? 0.25 : 1} />
              {i % 2 === 0 ? (
                <text x={x + bar / 2} y={H + 13} textAnchor="middle" fontSize="9" fill="var(--muted)">
                  {p.day.slice(8)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-muted">
        Last {points.length} days · today {format(points[points.length - 1]?.value ?? 0)}
      </p>
    </div>
  );
}
