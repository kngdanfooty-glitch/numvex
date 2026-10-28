'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PREMIUM_MONTHS, STARS_PACKS, formatNaira, type TelegramOrder, type TelegramQuote, type TelegramService } from '@numvexs/shared';
import { Icon } from '@/components/ui/icons';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMe, usePlaceTelegramOrder, useTelegramOrders, useTelegramQuote } from '@/lib/hooks';

const newRequestId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const unitsLabel = (service: TelegramService, units: number) => (service === 'premium' ? `${units} months of Premium` : `${units.toLocaleString()} Stars`);

const STATUS: Record<TelegramOrder['status'], { text: string; tone: string }> = {
  placing: { text: 'Processing', tone: 'text-muted' },
  processing: { text: 'Processing', tone: 'text-muted' },
  delivered: { text: 'Delivered', tone: 'text-success' },
  failed: { text: 'Failed — refunded', tone: 'text-danger' },
  review: { text: 'Being confirmed', tone: 'text-muted' },
};

/** Telegram Premium and Stars: pick a plan, type the username, check who it is, then buy. */
export function TelegramPage() {
  const [tab, setTab] = useState<'buy' | 'mine'>('buy');
  return (
    <div className="mx-auto max-w-5xl pb-8">
      <h1 className="section-kicker text-2xl font-extrabold">Telegram Premium &amp; Stars</h1>
      <p className="mb-4 mt-1 text-sm text-muted">Gift Telegram Premium or Stars to any username. Delivered straight to their account.</p>

      <div className="mb-4 flex gap-1.5 rounded-xl border border-border bg-surface p-1.5">
        {([
          { id: 'buy', label: 'Buy' },
          { id: 'mine', label: 'My orders' },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn('h-9 flex-1 cursor-pointer rounded-lg text-sm font-bold transition-colors', tab === t.id ? 'bg-accent text-white' : 'text-muted hover:bg-surface-2')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'buy' ? <Buy onDone={() => setTab('mine')} /> : <MyOrders />}
    </div>
  );
}

function Buy({ onDone }: { onDone: () => void }) {
  const [service, setService] = useState<TelegramService>('premium');
  const [units, setUnits] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [quote, setQuote] = useState<{ q: TelegramQuote; service: TelegramService; units: number; username: string } | null>(null);
  const [confirming, setConfirming] = useState<{ requestId: string } | null>(null);
  const [result, setResult] = useState<TelegramOrder | null>(null);
  const check = useTelegramQuote();
  const buy = usePlaceTelegramOrder();
  const user = useMe().data?.user;

  const plans = service === 'premium' ? PREMIUM_MONTHS : STARS_PACKS;
  const typed = username.trim().replace(/^@/, '');
  const ready = units !== null && /^[A-Za-z0-9_]{5,32}$/.test(typed);

  // Anything the buyer changes makes an earlier check out of date.
  const changed = () => {
    setQuote(null);
    setResult(null);
    check.reset();
    buy.reset();
  };

  if (result) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 text-center">
        <Icon name="bluetick" size={34} className="mx-auto text-accent" />
        <h2 className="mt-2 text-lg font-extrabold">
          {result.status === 'delivered' ? 'Delivered' : result.status === 'review' ? 'Order received' : 'Order placed'}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {unitsLabel(result.service, result.units)} for {result.recipient}.{' '}
          {result.status === 'delivered'
            ? 'It is already in their account.'
            : result.status === 'review'
              ? "We're confirming it with the supplier. It will be delivered, or your money returned."
              : 'It will show as delivered shortly.'}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={() => { setResult(null); setQuote(null); setUnits(null); setUsername(''); }} className="h-10 rounded-lg border border-border px-4 text-sm font-bold">
            Buy another
          </button>
          <button type="button" onClick={onDone} className="h-10 rounded-lg bg-accent px-4 text-sm font-bold text-white">
            My orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-border bg-surface p-3">
        <h2 className="pb-2 text-sm font-bold">1. What do you want to send?</h2>
        <div className="mb-3 flex gap-2">
          {(['premium', 'stars'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setService(s); setUnits(null); changed(); }}
              className={cn('h-9 rounded-lg border px-4 text-sm font-bold', service === s ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:bg-surface-2')}
            >
              {s === 'premium' ? 'Premium' : 'Stars'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {plans.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { setUnits(n); changed(); }}
              className={cn('rounded-xl border p-3 text-left', units === n ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2')}
            >
              <p className="text-lg font-extrabold">{service === 'premium' ? n : n.toLocaleString()}</p>
              <p className="text-xs text-muted">{service === 'premium' ? 'months' : 'Stars'}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <h2 className="pb-2 text-sm font-bold">2. Who is it for?</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            check.mutate({ service, units: units!, username: typed }, { onSuccess: (d) => setQuote({ q: d.quote, service, units: units!, username: typed }) });
          }}
        >
          <input
            value={username}
            onChange={(e) => { setUsername(e.target.value); changed(); }}
            placeholder="@username"
            autoCapitalize="none"
            autoCorrect="off"
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-accent"
          />
          <button type="submit" disabled={!ready || check.isPending} className="h-10 rounded-lg bg-accent px-4 text-sm font-bold text-white disabled:opacity-50">
            {check.isPending ? 'Checking…' : 'Check username'}
          </button>
        </form>
        {!ready && (
          <p className="mt-2 text-xs text-muted">
            {units === null
              ? 'Pick a plan in step 1 first.'
              : typed.length > 0 && 'Usernames are 5–32 characters: letters, numbers and underscores only.'}
          </p>
        )}
        {check.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {check.error instanceof ApiError ? check.error.message : 'Could not check that username. Try again.'}
          </p>
        )}
        {quote && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex min-w-0 items-center gap-3">
              {quote.q.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={quote.q.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{quote.q.name ?? quote.q.recipient}</p>
                <p className="truncate text-xs text-muted">{quote.q.recipient}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-base font-extrabold text-accent">{formatNaira(quote.q.priceKobo)}</span>
              <button
                type="button"
                disabled={buy.isPending}
                onClick={() => { buy.reset(); setConfirming({ requestId: newRequestId() }); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white disabled:opacity-50"
              >
                <Icon name="cart" size={14} /> Buy
              </button>
            </div>
          </div>
        )}
        {buy.isError && (
          <p role="alert" className="mt-3 rounded-xl border border-danger/30 px-4 py-3 text-sm text-danger">
            {buy.error instanceof ApiError ? buy.error.message : 'Could not place this order. Try again.'}
          </p>
        )}
      </div>

      {confirming && quote && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-extrabold">Send this order?</h2>
            <p className="mt-1 text-sm text-muted">
              {unitsLabel(quote.service, quote.units)} to {quote.q.recipient}
            </p>
            <dl className="mt-4 space-y-1 rounded-xl border border-border bg-surface-2 p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Price</dt>
                <dd className="font-bold text-accent">{formatNaira(quote.q.priceKobo)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Your balance</dt>
                <dd className="font-bold">{formatNaira(user?.balanceKobo ?? 0)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">Check the username: once it is sent to Telegram it can't be taken back.</p>
            {(user?.balanceKobo ?? 0) < quote.q.priceKobo && (
              <p className="mt-2 text-sm text-danger">
                You need {formatNaira(quote.q.priceKobo - (user?.balanceKobo ?? 0))} more.{' '}
                <Link href="/dashboard/wallet" className="font-bold underline">Fund wallet</Link>
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="h-10 flex-1 rounded-lg bg-red-600 text-sm font-bold text-white hover:bg-red-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={(user?.balanceKobo ?? 0) < quote.q.priceKobo || buy.isPending}
                onClick={() =>
                  buy.mutate(
                    { service: quote.service, units: quote.units, username: quote.username, requestId: confirming.requestId },
                    { onSuccess: (d) => { setConfirming(null); setResult(d.order); }, onError: () => setConfirming(null) },
                  )
                }
                className="h-10 flex-1 rounded-lg bg-accent text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {buy.isPending ? 'Sending…' : 'Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function MyOrders() {
  const orders = useTelegramOrders();
  if (orders.isPending) return <Box>Loading your orders…</Box>;
  if (orders.isError) {
    return (
      <Box>
        {orders.error instanceof ApiError ? orders.error.message : 'Could not load your orders.'}{' '}
        <button className="font-bold text-accent underline" onClick={() => orders.refetch()}>Try again</button>
      </Box>
    );
  }
  if (orders.data.orders.length === 0) return <Box>No Telegram orders yet.</Box>;
  return (
    <ul className="space-y-2">
      {orders.data.orders.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">{unitsLabel(o.service, o.units)}</p>
            <p className="text-xs text-muted">
              {o.recipient} · {formatNaira(o.costKobo)} · {new Date(o.createdAt).toLocaleDateString()}
            </p>
          </div>
          <span className={cn('text-xs font-bold', STATUS[o.status].tone)}>{STATUS[o.status].text}</span>
        </li>
      ))}
    </ul>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">{children}</div>;
}
