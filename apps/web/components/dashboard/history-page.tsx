'use client';

import { useMemo, useState } from 'react';
import { formatNaira, type HistoryEntry, type HistoryKind } from '@numvexs/shared';
import { Icon, type IconName } from '@/components/ui/icons';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useHistory } from '@/lib/hooks';

const KIND_ICON: Record<HistoryKind, IconName> = { deposit: 'bank', number: 'number', boost: 'boost', esim: 'esim', rental: 'key', telegram: 'bluetick' };

type Filter = 'all' | 'deposit' | 'purchase' | 'refund';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'deposit', label: 'Deposits' },
  { id: 'purchase', label: 'Purchases' },
  { id: 'refund', label: 'Refunds' },
];

const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Every deposit, purchase and refund on this account, newest first. Read-only: it only shows what already happened. */
export function HistoryPage() {
  const history = useHistory();
  const [filter, setFilter] = useState<Filter>('all');

  const entries = useMemo(() => (history.data?.pages ?? []).flatMap((p) => p.entries), [history.data]);
  const shown = useMemo(() => (filter === 'all' ? entries : entries.filter((e) => e.type === filter)), [entries, filter]);
  const days = useMemo(() => {
    const groups: { day: string; items: HistoryEntry[] }[] = [];
    for (const e of shown) {
      const day = dayOf(e.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(e);
      else groups.push({ day, items: [e] });
    }
    return groups;
  }, [shown]);

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <h1 className="section-kicker text-2xl font-extrabold">History</h1>
      <p className="mb-4 mt-1 text-sm text-muted">Every deposit, purchase and refund on your account.</p>

      <div className="mb-4 flex gap-1.5 rounded-xl border border-border bg-surface p-1.5" role="tablist" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn('h-9 flex-1 cursor-pointer rounded-lg text-sm font-bold transition-colors', filter === f.id ? 'bg-accent text-white' : 'text-muted hover:bg-surface-2')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {history.isPending ? (
        <Box>Loading your history…</Box>
      ) : history.isError ? (
        <Box>
          {history.error instanceof ApiError ? history.error.message : 'Could not load your history.'}{' '}
          <button className="font-bold text-accent underline" onClick={() => history.refetch()}>
            Try again
          </button>
        </Box>
      ) : entries.length === 0 ? (
        <Box>Nothing here yet. Deposits, purchases and refunds will appear as they happen.</Box>
      ) : shown.length === 0 ? (
        <Box>Nothing of this kind in what has loaded so far.</Box>
      ) : (
        <div className="space-y-5">
          {days.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.04em] text-faint">{g.day}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {g.items.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 p-3">
                    <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', e.amountKobo > 0 ? 'bg-success/10 text-success' : 'bg-accent-soft text-accent')}>
                      <Icon name={e.type === 'refund' ? 'refund' : KIND_ICON[e.kind]} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{e.title}</p>
                      <p className="truncate text-xs text-muted">
                        {timeOf(e.createdAt)}
                        {e.detail ? ` · ${e.detail}` : ''}
                      </p>
                    </div>
                    <span className={cn('shrink-0 text-sm font-extrabold', e.amountKobo > 0 ? 'text-success' : 'text-text')}>
                      {e.amountKobo > 0 ? '+' : '−'}
                      {formatNaira(Math.abs(e.amountKobo))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {history.hasNextPage ? (
            <button
              type="button"
              onClick={() => history.fetchNextPage()}
              disabled={history.isFetchingNextPage}
              className="h-11 w-full rounded-xl border border-border bg-surface text-sm font-bold text-accent hover:bg-surface-2 disabled:opacity-60"
            >
              {history.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          ) : (
            <p className="text-center text-xs text-faint">That is everything.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">{children}</div>;
}
