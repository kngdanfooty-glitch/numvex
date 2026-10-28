'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RENTAL_SERVERS, formatNaira, type Rental, type RentalCountry, type RentalOption, type RentalServerId } from '@numvexs/shared';
import { Icon } from '@/components/ui/icons';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useExtendRental, useMe, useRefreshRental, useRentNumber, useRental, useRentalCountries, useRentalOptions, useRentals } from '@/lib/hooks';

const SERVER_KEY = 'eotp_rental_server';

function savedServer(): RentalServerId {
  try {
    const saved = localStorage.getItem(SERVER_KEY);
    return RENTAL_SERVERS.find((s) => s.id === saved)?.id ?? RENTAL_SERVERS[0].id;
  } catch {
    return RENTAL_SERVERS[0].id;
  }
}

const newRequestId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const STATUS: Record<Rental['status'], { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  expired: { label: 'Ended', cls: 'bg-surface-2 text-muted' },
  placing: { label: 'Confirming', cls: 'bg-accent-soft text-accent' },
  failed: { label: 'Failed', cls: 'bg-surface-2 text-muted' },
};

function daysLeft(iso: string | null): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86_400_000);
  return d >= 1 ? `${d} day${d === 1 ? '' : 's'} left` : `${Math.max(1, Math.floor(ms / 3_600_000))} hour(s) left`;
}

/** Rent a number for days or months: it receives every SMS sent to it. "My rentals" lists them with their messages. */
export function RentalsPage() {
  const [tab, setTab] = useState<'rent' | 'mine'>('rent');
  return (
    <div className="mx-auto max-w-5xl pb-8">
      <h1 className="section-kicker text-2xl font-extrabold">Rent a Number</h1>
      <p className="mb-4 mt-1 text-sm text-muted">Keep a number for days or months and receive every code and message sent to it.</p>

      <div className="mb-4 flex gap-1.5 rounded-xl border border-border bg-surface p-1.5">
        {([
          { id: 'rent', label: 'Rent' },
          { id: 'mine', label: 'My rentals' },
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

      {tab === 'rent' ? <RentNumber onBought={() => setTab('mine')} /> : <MyRentals />}
    </div>
  );
}

/* ---------------- rent ---------------- */

function RentNumber({ onBought }: { onBought: () => void }) {
  const [server, setServer] = useState<RentalServerId>(savedServer);
  const countries = useRentalCountries(server);
  const [country, setCountry] = useState<RentalCountry | null>(null);

  const pick = (id: RentalServerId) => {
    setServer(id);
    setCountry(null);
    try {
      localStorage.setItem(SERVER_KEY, id);
    } catch {}
  };

  return (
    <section className="space-y-3">
      <div className="relative sm:w-[210px]">
        <Icon name="globe" size={19} className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-accent" />
        <select
          aria-label="Server"
          value={server}
          onChange={(e) => pick(e.target.value as RentalServerId)}
          className="h-12 w-full cursor-pointer appearance-none rounded-2xl border border-accent/25 bg-accent-soft/60 pl-[46px] pr-11 text-[15px] font-extrabold outline-none transition-colors hover:border-accent/50 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
        >
          {RENTAL_SERVERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <Icon name="chevron" size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-faint" />
      </div>

      <Step title="1. Select country">
        {countries.isPending ? (
          <p className="py-2 text-sm text-muted">Loading countries…</p>
        ) : countries.isError ? (
          <ErrorLine error={countries.error} fallback="Could not load this server." onRetry={() => countries.refetch()} />
        ) : country ? (
          <div className="flex items-center justify-between rounded-lg border border-border p-2">
            <p className="text-sm">{country.name}</p>
            <button type="button" aria-label="Change" onClick={() => setCountry(null)} className="px-2 text-xl font-bold leading-none text-red-500 hover:text-red-600">
              ×
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {countries.data.countries.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setCountry(c)} className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-sm transition-colors hover:bg-surface-2">
                  <span className="h-3.5 w-3.5 rounded-full border border-border-strong" />
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step title="2. Choose how long">
        {country ? <Options server={server} country={country} onBought={onBought} /> : <p className="py-2 text-sm text-muted">Choose a country first.</p>}
      </Step>
    </section>
  );
}

function Options({ server, country, onBought }: { server: RentalServerId; country: RentalCountry; onBought: () => void }) {
  const options = useRentalOptions(server, country.id);
  const rent = useRentNumber(server);
  const user = useMe().data?.user;
  const [confirming, setConfirming] = useState<{ option: RentalOption; requestId: string } | null>(null);

  if (options.isPending) return <p className="py-2 text-sm text-muted">Loading prices…</p>;
  if (options.isError) return <ErrorLine error={options.error} fallback="Could not load the prices." onRetry={() => options.refetch()} />;
  if (options.data.options.length === 0) return <p className="py-2 text-sm text-muted">No rentals for {country.name} right now.</p>;

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.data.options.map((o) => (
          <div key={o.id} className="flex flex-col rounded-xl border border-border p-3">
            <p className="text-xl font-extrabold">{o.label}</p>
            <p className="text-sm text-muted">{o.days} days of messages</p>
            <div className="mt-3 flex flex-1 items-end justify-between gap-2">
              <span className="text-base font-extrabold text-accent">{formatNaira(o.priceKobo)}</span>
              <button
                type="button"
                disabled={rent.isPending}
                onClick={() => {
                  rent.reset();
                  setConfirming({ option: o, requestId: newRequestId() });
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-white disabled:opacity-50"
              >
                <Icon name="cart" size={14} />
                Rent
              </button>
            </div>
          </div>
        ))}
      </div>

      {rent.isError && (
        <p role="alert" className="mt-3 rounded-xl border border-danger/30 px-4 py-3 text-sm text-danger">
          {rent.error instanceof ApiError ? rent.error.message : 'Could not rent this number. Try again.'}
        </p>
      )}

      {confirming && (
        <Confirm
          title="Rent this number?"
          subtitle={`${country.name} · ${confirming.option.label}`}
          priceKobo={confirming.option.priceKobo}
          balanceKobo={user?.balanceKobo ?? 0}
          pending={rent.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            rent.mutate(
              { option: confirming.option.id, country: country.id, requestId: confirming.requestId },
              {
                onSuccess: () => {
                  setConfirming(null);
                  onBought();
                },
                onError: () => setConfirming(null),
              },
            )
          }
        />
      )}
    </>
  );
}

function Confirm({
  title,
  subtitle,
  priceKobo,
  balanceKobo,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  priceKobo: number;
  balanceKobo: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const enough = balanceKobo >= priceKobo;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <dl className="mt-4 space-y-1 rounded-xl border border-border bg-surface-2 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Price</dt>
            <dd className="font-bold text-accent">{formatNaira(priceKobo)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Your balance</dt>
            <dd className="font-bold">{formatNaira(balanceKobo)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">A rental can&apos;t be refunded once the number is given to you. It does not renew by itself.</p>
        {!enough && (
          <p className="mt-2 text-sm text-danger">
            You need {formatNaira(priceKobo - balanceKobo)} more.{' '}
            <Link href="/dashboard/wallet" className="font-bold underline">
              Fund wallet
            </Link>
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="h-10 flex-1 rounded-lg bg-red-600 text-sm font-bold text-white hover:bg-red-700">
            Cancel
          </button>
          <button type="button" disabled={!enough || pending} onClick={onConfirm} className="h-10 flex-1 rounded-lg bg-accent text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? 'Renting…' : 'Rent'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- my rentals ---------------- */

export function MyRentals() {
  const rentals = useRentals();
  const [openId, setOpenId] = useState<string | null>(null);

  if (rentals.isPending) return <Box>Loading your rentals…</Box>;
  if (rentals.isError) return <Box><ErrorLine error={rentals.error} fallback="Could not load your rentals." onRetry={() => rentals.refetch()} /></Box>;
  if (rentals.data.rentals.length === 0) return <Box>You haven&apos;t rented a number yet. Pick a country under Rent.</Box>;

  return (
    <>
      <ul className="space-y-2">
        {rentals.data.rentals.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-mono text-sm font-bold">
                  {r.number || 'Confirming…'}
                  {r.number && <CopyText text={r.number} label="Copy number" />}
                </p>
                <p className="text-xs text-muted">
                  {r.countryName} · {r.totalDays} days · {formatNaira(r.costKobo)}
                </p>
              </div>
              <span className={cn('rounded px-2 py-0.5 text-[11px] font-extrabold', STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
            </div>
            {r.status === 'placing' && <p className="mt-2 text-xs text-muted">We are confirming this purchase with the server. It will show here, or your money will be returned.</p>}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted">
                {r.status === 'active' ? daysLeft(r.expiresAt) : r.expiresAt ? `Ended ${new Date(r.expiresAt).toLocaleDateString()}` : ''} · {r.messageCount} message{r.messageCount === 1 ? '' : 's'}
              </span>
              {r.number && (
                <button type="button" onClick={() => setOpenId(r.id)} className="h-8 rounded-lg bg-accent px-3 text-xs font-bold text-white">
                  Open
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {openId && <RentalDetail id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function RentalDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const one = useRental(id);
  const refresh = useRefreshRental(id);
  const extend = useExtendRental(id);
  const user = useMe().data?.user;
  const r = one.data?.rental;
  const [extending, setExtending] = useState(false);
  const [chosen, setChosen] = useState<{ option: RentalOption; requestId: string } | null>(null);
  const options = useRentalOptions(extending && r && r.server !== 'retired' ? r.server : null, extending && r ? r.countryId : null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-extrabold">Rented number</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="px-1 text-2xl font-bold leading-none text-muted hover:text-text">
            ×
          </button>
        </div>

        {!r ? (
          <p className="py-6 text-sm text-muted">{one.isError ? 'Could not load this rental.' : 'Loading…'}</p>
        ) : (
          <>
            <p className="mt-2 flex items-center gap-1 font-mono text-lg font-extrabold">
              {r.number}
              <CopyText text={r.number} label="Copy number" />
            </p>
            <p className="text-xs text-muted">
              {r.countryName} · {r.status === 'active' ? daysLeft(r.expiresAt) : STATUS[r.status].label}
              {r.expiresAt && ` · until ${new Date(r.expiresAt).toLocaleDateString()}`}
            </p>

            <div className="mt-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Messages</h3>
              {r.status === 'active' && (
                <button type="button" disabled={refresh.isPending} onClick={() => refresh.mutate()} className="text-xs font-bold text-accent underline disabled:opacity-50">
                  {refresh.isPending ? 'Checking…' : 'Check now'}
                </button>
              )}
            </div>
            <ul className="mt-2 min-h-24 flex-1 space-y-2 overflow-y-auto">
              {r.messages.length === 0 && <li className="rounded-lg border border-border p-3 text-sm text-muted">No messages yet. New ones appear here by themselves.</li>}
              {r.messages.map((m) => (
                <li key={m.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{m.from ?? 'Unknown sender'}</span>
                    <span>{new Date(m.receivedAt).toLocaleString()}</span>
                  </div>
                  {m.code && (
                    <p className="mt-1 flex items-center gap-1 font-mono text-lg font-extrabold text-green-700">
                      {m.code}
                      <CopyText text={m.code} label="Copy code" />
                    </p>
                  )}
                  <p className="mt-1 break-words text-sm">{m.text}</p>
                </li>
              ))}
            </ul>
            {refresh.isError && <p className="mt-2 text-xs text-danger">{refresh.error instanceof ApiError ? refresh.error.message : 'Could not check right now.'}</p>}

            {r.status === 'active' && r.server !== 'retired' && (
              <div className="mt-3 border-t border-border pt-3">
                {!extending ? (
                  <button type="button" onClick={() => setExtending(true)} className="h-10 w-full rounded-lg bg-accent text-sm font-bold text-white">
                    Add more time
                  </button>
                ) : options.isPending ? (
                  <p className="text-sm text-muted">Loading prices…</p>
                ) : options.isError ? (
                  <ErrorLine error={options.error} fallback="Could not load the prices." onRetry={() => options.refetch()} />
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">Pick how much time to add. It is charged from your wallet now.</p>
                    {options.data.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        disabled={extend.isPending}
                        onClick={() => {
                          extend.reset();
                          setChosen({ option: o, requestId: newRequestId() });
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-border p-2 text-sm hover:bg-surface-2 disabled:opacity-50"
                      >
                        <span className="font-bold">+ {o.label}</span>
                        <span className="font-extrabold text-accent">{formatNaira(o.priceKobo)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {extend.isError && <p role="alert" className="mt-2 text-sm text-danger">{extend.error instanceof ApiError ? extend.error.message : 'Could not add time. Try again.'}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {chosen && r && (
        <Confirm
          title="Add more time?"
          subtitle={`${r.number} · + ${chosen.option.label}`}
          priceKobo={chosen.option.priceKobo}
          balanceKobo={user?.balanceKobo ?? 0}
          pending={extend.isPending}
          onCancel={() => setChosen(null)}
          onConfirm={() =>
            extend.mutate(
              { option: chosen.option.id, requestId: chosen.requestId },
              {
                onSuccess: () => {
                  setChosen(null);
                  setExtending(false);
                },
                onError: () => setChosen(null),
              },
            )
          }
        />
      )}
    </div>
  );
}

/* ---------------- small pieces ---------------- */

function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
      className="cursor-pointer rounded-md px-1 text-[10px] font-bold text-accent hover:bg-surface-2"
    >
      {copied ? 'COPIED' : 'COPY'}
    </button>
  );
}

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
