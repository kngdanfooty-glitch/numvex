'use client';

import Link from 'next/link';
import { BOOST_SERVERS, formatNaira, type BoostOrder, type BoostOrderStatus } from '@numvexs/shared';
import { ApiError } from '@/lib/api';
import { useBoostOrders } from '@/lib/hooks';
import { cn } from '@/lib/cn';

const STATUS: Record<BoostOrderStatus, { label: string; cls: string }> = {
  placing: { label: 'Placing', cls: 'bg-surface-2 text-muted' },
  pending: { label: 'Pending', cls: 'bg-accent-soft text-accent' },
  in_progress: { label: 'In progress', cls: 'bg-accent-soft text-accent' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  partial: { label: 'Partial', cls: 'bg-amber-100 text-amber-700' },
  canceled: { label: 'Cancelled', cls: 'bg-surface-2 text-muted' },
  failed: { label: 'Not placed', cls: 'bg-surface-2 text-muted' },
};

/** The user's boost orders: progress while they run, and what was refunded if they could not be fully delivered. */
export function BoostOrdersList() {
  const orders = useBoostOrders();

  if (orders.isPending) return <Box>Loading your orders…</Box>;
  if (orders.isError) {
    return (
      <Box>
        {orders.error instanceof ApiError ? orders.error.message : 'Could not load your orders.'}{' '}
        <button className="font-bold text-accent underline" onClick={() => orders.refetch()}>
          Try again
        </button>
      </Box>
    );
  }
  if (orders.data.orders.length === 0) {
    return (
      <Box>
        No boost orders yet.{' '}
        <Link href="/dashboard/boost" className="font-bold text-accent underline">
          Browse services
        </Link>
      </Box>
    );
  }

  return (
    <ul className="space-y-2">
      {orders.data.orders.map((o) => (
        <OrderCard key={o.id} o={o} />
      ))}
    </ul>
  );
}

function OrderCard({ o }: { o: BoostOrder }) {
  const status = STATUS[o.status];
  // How many have been delivered, when the panel tells us what is left.
  const delivered = o.remains !== null ? Math.max(0, o.quantity - o.remains) : o.status === 'completed' ? o.quantity : null;
  const pct = delivered !== null ? Math.min(100, Math.round((delivered / o.quantity) * 100)) : null;
  const server = BOOST_SERVERS.find((s) => s.id === o.server)?.label ?? o.server;

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold">{o.serviceName}</p>
          <a href={o.link} target="_blank" rel="noopener noreferrer" className="block max-w-[28rem] truncate text-xs text-accent hover:underline">
            {o.link}
          </a>
        </div>
        <span className={cn('rounded px-2 py-0.5 text-[11px] font-extrabold', status.cls)}>{status.label}</span>
      </div>

      {pct !== null && o.status !== 'canceled' && o.status !== 'failed' && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {delivered?.toLocaleString('en-US')} of {o.quantity.toLocaleString('en-US')} delivered
          </p>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Field label="Quantity" value={o.quantity.toLocaleString('en-US')} />
        <Field label="Price" value={formatNaira(o.costKobo)} />
        <Field label="Server" value={server} />
        <Field label="Date" value={new Date(o.createdAt).toLocaleString()} />
      </dl>

      {o.refundedKobo > 0 && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
          {formatNaira(o.refundedKobo)} was refunded to your wallet
          {o.status === 'partial' ? ' for the part that could not be delivered.' : '.'}
        </p>
      )}
      <p className="mt-2 font-mono text-[11px] text-faint">Ref {o.id.slice(-8).toUpperCase()}</p>
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">{children}</div>;
}
