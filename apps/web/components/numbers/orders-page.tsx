'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatNaira, type NumberActivation } from '@numvexs/shared';
import { ApiError } from '@/lib/api';
import { useNumberOrders } from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { BoostOrdersList } from '@/components/dashboard/boost-orders';
import { MyEsims } from '@/components/esim/esim-page';
import { MyRentals } from '@/components/rentals/rentals-page';
import { MyOrders as TelegramOrders } from '@/components/telegram/telegram-page';
import { ActivationModal } from './activation-modal';

const STATUS: Record<NumberActivation['status'], { label: string; cls: string }> = {
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  pending: { label: 'Waiting for code', cls: 'bg-accent-soft text-accent' },
  cancelled: { label: 'Refunded', cls: 'bg-surface-2 text-muted' },
};

type Tab = 'numbers' | 'rentals' | 'boost' | 'esim' | 'telegram';
const HINT: Record<Tab, string> = {
  numbers: 'Every number you have bought, with its code and what you paid.',
  rentals: 'Every number you rent, with its messages. Open one to read them or extend it.',
  boost: 'Every boost order, with its progress and any refund.',
  esim: 'Every eSIM you have bought. Open one to see its QR code.',
  telegram: 'Every Telegram Premium and Stars order, and whether it was delivered.',
};

/** Orders for every service, switched like FloZap's toggle. Only the open tab asks the server. `?tab=rentals|boost|esim|telegram` opens that tab. */
export function OrdersPage() {
  const [tab, setTab] = useState<Tab>(() => {
    const t = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
    return t === 'rentals' || t === 'boost' || t === 'esim' || t === 'telegram' ? t : 'numbers';
  });

  return (
    <div className="mx-auto max-w-5xl pb-8">
      <h1 className="section-kicker text-2xl font-extrabold">Orders</h1>
      <p className="mb-4 mt-1 text-sm text-muted">
        {HINT[tab]}
      </p>

      <div className="mb-4 flex gap-1.5 rounded-xl border border-border bg-surface p-1.5">
        {([
          { id: 'numbers', label: 'Numbers' },
          { id: 'rentals', label: 'Rentals' },
          { id: 'boost', label: 'Boost' },
          { id: 'esim', label: 'eSIM' },
          { id: 'telegram', label: 'Telegram' },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'h-9 flex-1 cursor-pointer rounded-lg text-sm font-bold transition-colors',
              tab === t.id ? 'bg-accent text-white' : 'text-muted hover:bg-surface-2',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'numbers' ? <NumberOrders /> : tab === 'rentals' ? <MyRentals /> : tab === 'boost' ? <BoostOrdersList /> : tab === 'esim' ? <MyEsims /> : <TelegramOrders />}
    </div>
  );
}

/** Number purchase history, like FloZap's "My Orders": reference, service, number, code, price, date. */
function NumberOrders() {
  const orders = useNumberOrders();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      {orders.isPending ? (
        <Box>Loading your orders…</Box>
      ) : orders.isError ? (
        <Box>
          {orders.error instanceof ApiError ? orders.error.message : 'Could not load your orders.'}{' '}
          <button className="font-bold text-accent underline" onClick={() => orders.refetch()}>
            Try again
          </button>
        </Box>
      ) : orders.data.activations.length === 0 ? (
        <Box>
          No orders yet.{' '}
          <Link href="/dashboard/usa" className="font-bold text-accent underline">
            Buy a USA number
          </Link>
        </Box>
      ) : (
        <ul className="space-y-2">
          {orders.data.activations.map((a) => (
            <li key={a.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{a.service}</p>
                  <p className="text-xs text-muted">{a.country}</p>
                </div>
                <span className={cn('rounded px-2 py-0.5 text-[11px] font-extrabold', STATUS[a.status].cls)}>
                  {STATUS[a.status].label}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <Field label="Number" value={a.number} mono />
                <Field label="Code" value={a.code ?? '—'} mono />
                <Field label="Price" value={formatNaira(a.costKobo)} />
                <Field label="Date" value={new Date(a.createdAt).toLocaleString()} />
              </dl>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-faint">Ref {a.id.slice(-8).toUpperCase()}</span>
                {a.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => setOpenId(a.id)}
                    className="h-8 rounded-lg bg-accent px-3 text-xs font-bold text-white"
                  >
                    View
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {openId && (
        <ActivationModal
          id={openId}
          onClose={() => {
            setOpenId(null);
            qc.invalidateQueries({ queryKey: ['numbers', 'orders'] }); // the number may have settled while it was open
          }}
        />
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn('font-semibold', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">{children}</div>;
}
