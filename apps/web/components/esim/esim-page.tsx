'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ESIM_SERVERS, formatNaira, type EsimCountry, type EsimOrder, type EsimPlan, type EsimServerId } from '@numvexs/shared';
import { Icon } from '@/components/ui/icons';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useEsimCountries, useEsimOrder, useEsimOrders, useEsimPlans, useMe, usePlaceEsimOrder } from '@/lib/hooks';
import { EsimQrModal } from './esim-qr-modal';

const SERVER_KEY = 'eotp_esim_server';

function savedServer(): EsimServerId {
  try {
    const saved = localStorage.getItem(SERVER_KEY);
    return ESIM_SERVERS.find((s) => s.id === saved)?.id ?? ESIM_SERVERS[0].id;
  } catch {
    return ESIM_SERVERS[0].id;
  }
}

const newRequestId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const gb = (n: number) => (n < 1 ? `${Math.round(n * 1000)} MB` : `${Number(n.toFixed(2))} GB`);

/** eSIMs: pick a server, a country, then a plan. "My eSIMs" lists what was bought, with its QR code. */
export function EsimPage() {
  const [tab, setTab] = useState<'buy' | 'mine'>('buy');

  return (
    <div className="mx-auto max-w-5xl pb-8">
      <h1 className="section-kicker text-2xl font-extrabold">eSIMs</h1>
      <p className="mb-4 mt-1 text-sm text-muted">Data plans for travel and for backup. Buy one, scan the QR code, and you are online.</p>

      <div className="mb-4 flex gap-1.5 rounded-xl border border-border bg-surface p-1.5">
        {([
          { id: 'buy', label: 'Buy eSIM' },
          { id: 'mine', label: 'My eSIMs' },
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

      {tab === 'buy' ? <BuyEsim /> : <MyEsims />}
    </div>
  );
}

/* ---------------- buy ---------------- */

function BuyEsim() {
  const [server, setServer] = useState<EsimServerId>(savedServer);
  const countries = useEsimCountries(server); // the first server is fetched by default
  const [country, setCountry] = useState<EsimCountry | null>(null);

  const pick = (id: EsimServerId) => {
    setServer(id);
    setCountry(null);
    try {
      localStorage.setItem(SERVER_KEY, id);
    } catch {}
  };

  return (
    <section className="space-y-3">
      {/* Server dropdown, like the Boost page's */}
      {ESIM_SERVERS.length > 1 && (
      <div className="relative sm:w-[210px]">
        <Icon name="globe" size={19} className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-accent" />
        <select
          aria-label="Server"
          value={server}
          onChange={(e) => pick(e.target.value as EsimServerId)}
          className="h-12 w-full cursor-pointer appearance-none rounded-2xl border border-accent/25 bg-accent-soft/60 pl-[46px] pr-11 text-[15px] font-extrabold outline-none transition-colors hover:border-accent/50 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
        >
          {ESIM_SERVERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <Icon name="chevron" size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-faint" />
      </div>
      )}

      <Step title="1. Select country">
        {countries.isPending ? (
          <p className="py-2 text-sm text-muted">Loading countries…</p>
        ) : countries.isError ? (
          <ErrorLine error={countries.error} fallback="Could not load this server." onRetry={() => countries.refetch()} />
        ) : (
          <CountryPicker key={server} items={countries.data.countries} selected={country} onSelect={setCountry} onClear={() => setCountry(null)} />
        )}
      </Step>

      <Step title="2. Choose a plan">
        {country ? <Plans server={server} country={country} /> : <p className="py-2 text-sm text-muted">Choose a country first.</p>}
      </Step>
    </section>
  );
}

function Plans({ server, country }: { server: EsimServerId; country: EsimCountry }) {
  const plans = useEsimPlans(server, country.id);
  const buy = usePlaceEsimOrder(server);
  const user = useMe().data?.user;
  const [confirming, setConfirming] = useState<{ plan: EsimPlan; requestId: string } | null>(null);
  const [bought, setBought] = useState<EsimOrder | null>(null);

  if (plans.isPending) return <p className="py-2 text-sm text-muted">Loading plans…</p>;
  if (plans.isError) return <ErrorLine error={plans.error} fallback="Could not load the plans." onRetry={() => plans.refetch()} />;
  if (plans.data.plans.length === 0) return <p className="py-2 text-sm text-muted">No eSIM plans for {country.name} right now.</p>;

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {plans.data.plans.map((p) => (
          <div key={p.id} className="flex flex-col rounded-xl border border-border p-3">
            <p className="text-xl font-extrabold">{gb(p.dataGb)}</p>
            <p className="text-sm text-muted">{p.days} day{p.days === 1 ? '' : 's'}</p>
            {(p.network || p.speed) && <p className="mt-1 text-xs text-faint">{[p.network, p.speed].filter(Boolean).join(' · ')}</p>}
            <div className="mt-3 flex flex-1 items-end justify-between gap-2">
              <span className="text-base font-extrabold text-accent">{formatNaira(p.priceKobo)}</span>
              <button
                type="button"
                disabled={buy.isPending}
                onClick={() => {
                  buy.reset();
                  setConfirming({ plan: p, requestId: newRequestId() });
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white disabled:opacity-50"
              >
                <Icon name="cart" size={14} />
                Buy
              </button>
            </div>
          </div>
        ))}
      </div>

      {buy.isError && (
        <p role="alert" className="mt-3 rounded-xl border border-danger/30 px-4 py-3 text-sm text-danger">
          {buy.error instanceof ApiError ? buy.error.message : 'Could not buy this eSIM. Try again.'}
        </p>
      )}

      {confirming && (
        <ConfirmBuy
          plan={confirming.plan}
          country={country.name}
          balanceKobo={user?.balanceKobo ?? 0}
          pending={buy.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            buy.mutate(
              { plan: confirming.plan.id, country: country.id, requestId: confirming.requestId },
              {
                onSuccess: (d) => {
                  setConfirming(null);
                  setBought(d.order);
                },
                onError: () => setConfirming(null),
              },
            )
          }
        />
      )}

      {bought && <EsimQrModal title={`${bought.countryName} · ${bought.planSummary}`} details={bought.details} onClose={() => setBought(null)} />}
    </>
  );
}

function ConfirmBuy({
  plan,
  country,
  balanceKobo,
  pending,
  onCancel,
  onConfirm,
}: {
  plan: EsimPlan;
  country: string;
  balanceKobo: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const enough = balanceKobo >= plan.priceKobo;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h2 className="text-lg font-extrabold">Buy this eSIM?</h2>
        <p className="mt-1 text-sm text-muted">
          {country} · {gb(plan.dataGb)} for {plan.days} day{plan.days === 1 ? '' : 's'}
        </p>
        <dl className="mt-4 space-y-1 rounded-xl border border-border bg-surface-2 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Price</dt>
            <dd className="font-bold text-accent">{formatNaira(plan.priceKobo)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Your balance</dt>
            <dd className="font-bold">{formatNaira(balanceKobo)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">Check the country and size: an eSIM can't be refunded once it has been issued.</p>
        {!enough && (
          <p className="mt-2 text-sm text-danger">
            You need {formatNaira(plan.priceKobo - balanceKobo)} more.{' '}
            <Link href="/dashboard/wallet" className="font-bold underline">
              Fund wallet
            </Link>
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="h-10 flex-1 rounded-lg bg-red-600 text-sm font-bold text-white hover:bg-red-700">
            Cancel
          </button>
          <button
            type="button"
            disabled={!enough || pending}
            onClick={onConfirm}
            className="h-10 flex-1 rounded-lg bg-accent text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Buying…' : 'Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- my eSIMs ---------------- */

export function MyEsims() {
  const orders = useEsimOrders();
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = useEsimOrder(openId);

  if (orders.isPending) return <Box>Loading your eSIMs…</Box>;
  if (orders.isError) return <Box><ErrorLine error={orders.error} fallback="Could not load your eSIMs." onRetry={() => orders.refetch()} /></Box>;
  if (orders.data.orders.length === 0) return <Box>You haven't bought an eSIM yet. Pick a country under Buy eSIM.</Box>;

  return (
    <>
      <ul className="space-y-2">
        {orders.data.orders.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="min-w-0">
              <p className="text-sm font-bold">{o.countryName}</p>
              <p className="text-xs text-muted">
                {o.planSummary} · {formatNaira(o.costKobo)} · {new Date(o.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button type="button" onClick={() => setOpenId(o.id)} className="h-9 rounded-lg bg-accent px-3 text-xs font-bold text-white">
              View QR
            </button>
          </li>
        ))}
      </ul>
      {openId && (
        <EsimQrModal
          title={opened.data ? `${opened.data.order.countryName} · ${opened.data.order.planSummary}` : 'Loading…'}
          details={opened.data?.order.details}
          loading={opened.isPending}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

/* ---------------- small pieces ---------------- */

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <h2 className="pb-2 text-sm font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">{children}</div>;
}

function ErrorLine({ error, fallback, onRetry }: { error: unknown; fallback: string; onRetry: () => void }) {
  return (
    <p className="text-sm text-muted">
      {error instanceof ApiError ? error.message : fallback}{' '}
      <button className="font-bold text-accent underline" onClick={onRetry}>
        Try again
      </button>
    </p>
  );
}

/** Search box + scrolling list. Once a country is picked it collapses to one row with a × to change it. */
function CountryPicker({
  items,
  selected,
  onSelect,
  onClear,
}: {
  items: EsimCountry[];
  selected: EsimCountry | null;
  onSelect: (c: EsimCountry) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((c) => c.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border p-2">
        <p className="text-sm">{selected.name}</p>
        <button type="button" aria-label="Change" onClick={onClear} className="px-2 text-xl font-bold leading-none text-red-500 hover:text-red-600">
          ×
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search country"
        className="mb-2 w-full rounded-lg border border-border bg-surface p-2 text-sm outline-none transition-colors focus:border-accent"
      />
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {shown.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-sm transition-colors hover:bg-surface-2"
            >
              <span className="h-3.5 w-3.5 rounded-full border border-border-strong" />
              {c.name}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="py-2 text-sm text-muted">Nothing found.</li>}
      </ul>
    </>
  );
}
