'use client';

import { useEffect, useRef, useState } from 'react';
import { formatNaira } from '@numvexs/shared';
import { Icon } from '@/components/ui/icons';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useActivation, useCancelNumber, useMarkNumberDone } from '@/lib/hooks';

/** Counts down to `expiresAt` (7 minutes after the purchase). `ended` is true once it reaches zero. */
function useCountdown(expiresAt: string | undefined) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const s = Math.floor((left ?? 0) / 1000);
  return { text: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, ended: left === 0 };
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

/** A small copy button that says COPIED for a moment, like FloZap's. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  return (
    <button type="button" onClick={copy} title={label} aria-label={label} className="cursor-pointer rounded-md p-1 text-accent transition-colors hover:bg-surface-2">
      {copied ? <span className="text-[10px] font-bold">COPIED</span> : <CopyIcon />}
    </button>
  );
}

/** Placeholder while the number is loading, in the same shape as the real modal. */
function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="mx-auto h-6 w-48 animate-pulse rounded bg-surface-2" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between">
          <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
        </div>
      ))}
      <div className="h-14 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-10 animate-pulse rounded-md bg-surface-2" />
    </div>
  );
}

/**
 * "Number Purchase Details", laid out like FloZap's: service, country, time left, the number (with copy), a status badge,
 * the OTP box, then one action: Cancel Order while waiting, Done / Finished when the code is in.
 */
export function ActivationModal({ id, onClose }: { id: string; onClose: (finished: boolean) => void }) {
  const query = useActivation(id);
  const cancel = useCancelNumber();
  const markDone = useMarkNumberDone();
  const a = query.data?.activation;
  const { text: timeLeft, ended } = useCountdown(a?.expiresAt);

  const waiting = a?.status === 'pending';
  const done = a?.status === 'completed';
  const cancelled = a?.status === 'cancelled';

  // When the countdown runs out with no code, close the modal. The server's refund job cancels at the provider and refunds once the
  // provider confirms; the order shows in the list meanwhile. Only if we watched it run out: an old expired order opened from the
  // list stays open.
  const sawTimeLeft = useRef(false);
  if (waiting && !ended && a) sawTimeLeft.current = true;
  useEffect(() => {
    if (waiting && ended && sawTimeLeft.current) onClose(false);
  }, [waiting, ended, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Number purchase details">
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-text shadow-2xl">
        {!a ? (
          <Skeleton />
        ) : (
          <>
            <h2 className="mb-6 border-b border-border pb-4 text-center text-lg font-bold">Number Purchase Details</h2>

            <div className="space-y-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted">Service:</span>
                <span className="text-right font-semibold uppercase">{a.service}</span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-muted">Country:</span>
                <span className="text-right font-medium">{a.country}</span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-muted">Time-left:</span>
                <span className="font-mono font-semibold text-accent">{waiting ? timeLeft : '—'}</span>
              </div>

              <div className="border-t border-border pt-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted">Number:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base">{a.number}</span>
                    <CopyButton text={a.number} label="Copy number" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Status:</span>
                <span
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                    done ? 'border-success/30 bg-success/10 text-success' : cancelled ? 'border-danger/30 bg-danger/10 text-danger' : 'border-border bg-surface-2 text-muted',
                  )}
                >
                  {done ? 'Success' : cancelled ? 'Cancelled' : 'Waiting for OTP'}
                </span>
              </div>

              <div className="rounded-lg border border-border bg-surface-2 p-3">
                {done ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">OTP Code:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold tracking-widest text-success">{a.code}</span>
                      <CopyButton text={a.code ?? ''} label="Copy code" />
                    </div>
                  </div>
                ) : cancelled ? (
                  <p className="text-center text-sm">{formatNaira(a.costKobo)} was returned to your wallet.</p>
                ) : ended ? (
                  <p className="text-center text-sm font-semibold">Time is up. Your wallet will be refunded automatically.</p>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">OTP:</span>
                    <div className="flex gap-1" aria-label="Waiting for the code">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-accent" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {cancel.data?.refused && !cancel.isPending && (
              <p className="mt-3 text-sm text-muted">This server can&apos;t cancel this number yet. Try again in a minute. If no code arrives you are refunded automatically.</p>
            )}
            {cancel.isError && <p role="alert" className="mt-3 text-sm text-danger">{cancel.error instanceof ApiError ? cancel.error.message : 'Could not cancel.'}</p>}

            <div className="mt-6">
              {waiting ? (
                <>
                  <button
                    type="button"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(a.id)}
                    className="w-full cursor-pointer rounded-md border border-danger/30 bg-danger/10 py-2.5 text-xs font-bold uppercase text-danger transition-all hover:border-danger hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cancel.isPending ? 'Cancelling...' : 'Cancel Order'}
                  </button>
                  <button type="button" onClick={() => onClose(false)} className="mt-2 w-full cursor-pointer py-1.5 text-xs font-semibold text-muted hover:text-text">
                    Hide (keep waiting in the background)
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (done) markDone.mutate(a.id); // best effort: release the number at the provider
                    onClose(true);
                  }}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-accent py-2.5 text-xs font-bold uppercase text-white transition-colors hover:brightness-110"
                >
                  {done ? (
                    <>
                      <Icon name="check" size={14} /> Done / Finished
                    </>
                  ) : (
                    'Close'
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
