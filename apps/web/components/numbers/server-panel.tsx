'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BUYABLE_SERVERS, formatNaira, type CatalogItem, type NumberServerId } from '@numvexs/shared';
import { ApiError } from '@/lib/api';
import { useBuyNumber, useNumberCatalog, useNumberQuote } from '@/lib/hooks';
import { Icon } from '@/components/ui/icons';
import { ConfirmDialog } from './confirm-dialog';

// Shown first in every country list (the same order FloZap used).
const PRIORITY = ['United States', 'United Kingdom', 'Canada', 'Australia', 'France', 'Spain'];

function sortCountries(items: CatalogItem[]): CatalogItem[] {
  const rank = (n: string) => {
    const i = PRIORITY.indexOf(n);
    return i === -1 ? PRIORITY.length : i;
  };
  return [...items].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** One server's whole buy flow: country (if it has several) -> service -> price -> buy. Fetches only when mounted. */
export function ServerPanel({ server, onBought }: { server: NumberServerId; onBought: (id: string) => void }) {
  const catalog = useNumberCatalog(server);
  const countries = useMemo(() => sortCountries(catalog.data?.countries ?? []), [catalog.data]);
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [service, setService] = useState<CatalogItem | null>(null);

  // A server that sells one country (the USA-only ones) has nothing to choose: go straight to its services.
  const onlyCountry = countries.length === 1 ? countries[0]! : null;
  const country = onlyCountry ?? picked;

  if (catalog.isPending) return <Notice>Loading this server…</Notice>;
  if (catalog.isError) {
    const msg = catalog.error instanceof ApiError ? catalog.error.message : 'Could not load this server.';
    return (
      <Notice>
        {msg}{' '}
        <button className="font-bold text-accent underline" onClick={() => catalog.refetch()}>
          Try again
        </button>
      </Notice>
    );
  }

  return (
    <section className="space-y-3">
      {!onlyCountry && (
        <Step title="1. Select country">
          <Picker
            items={countries}
            selected={picked}
            placeholder="Search country"
            onSelect={(c) => {
              setPicked(c);
              setService(null);
            }}
            onClear={() => {
              setPicked(null);
              setService(null);
            }}
          />
        </Step>
      )}

      <Step title={onlyCountry ? `Select service (${onlyCountry.name})` : '2. Select service'}>
        {country ? (
          <Picker
            items={catalog.data.services}
            selected={service}
            placeholder="Search service"
            onSelect={setService}
            onClear={() => setService(null)}
          />
        ) : (
          <p className="py-2 text-sm text-muted">Choose a country first.</p>
        )}
      </Step>

      {country && service && <BuyBox server={server} country={country} service={service} onBought={onBought} />}
    </section>
  );
}

function BuyBox({
  server,
  country,
  service,
  onBought,
}: {
  server: NumberServerId;
  country: CatalogItem;
  service: CatalogItem;
  onBought: (id: string) => void;
}) {
  const buyable = BUYABLE_SERVERS.includes(server);
  const quote = useNumberQuote(server, buyable ? service.id : null, country.id);
  const buy = useBuyNumber(server);
  // Set while the "Before you proceed" modal is open. `tier` is the price row that was clicked (servers with several prices).
  const [confirming, setConfirming] = useState<{ tier?: string } | null>(null);

  if (!buyable) {
    return (
      <Notice>
        Prices for this server aren't connected yet, so it can't be bought from. For USA numbers use{' '}
        <Link href="/dashboard/usa" className="font-bold text-accent underline">
          USA Numbers
        </Link>
        .
      </Notice>
    );
  }
  if (quote.isPending) return <Notice>Loading price…</Notice>;
  if (quote.isError) return <Notice>{quote.error instanceof ApiError ? quote.error.message : 'Could not load the price.'}</Notice>;

  // One row for a single-price server; one row per price tier for a server that sells the same number at several prices.
  const tiers = quote.data.tiers;
  const rows: { tier?: string; costKobo: number; stock: number | null; note?: string }[] = tiers
    ? tiers.map((t) => ({ tier: t.id, costKobo: t.costKobo, stock: t.stock, note: t.note }))
    : [{ costKobo: quote.data.costKobo, stock: quote.data.stock }];

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      {tiers && tiers.length > 1 && <p className="pb-2 text-xs text-muted">Pick a price. Higher-priced numbers usually have better success rates.</p>}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {rows.map((r) => (
          // FloZap's price row: service on the left, stock in the middle, price + cart on the right. One click target.
          <button
            key={r.tier ?? 'single'}
            type="button"
            disabled={buy.isPending || r.stock === 0}
            onClick={() => setConfirming({ tier: r.tier })}
            className="grid w-full cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-accent px-3 py-2.5 text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="min-w-0 text-left">
              <span className="block truncate text-xs font-semibold">{service.name}</span>
              {r.note && <span className="block truncate text-[10px] text-white/80">{r.note}</span>}
            </span>
            <span className="text-center text-xs text-white/80">
              {r.stock !== null ? `Stock: ${r.stock}` : ''}
            </span>
            <span className="flex items-center justify-end gap-1.5 text-sm font-bold">
              {buy.isPending ? 'Buying…' : formatNaira(r.costKobo)}
              <Icon name="cart" size={16} />
            </span>
          </button>
        ))}
      </div>
      {buy.isError && (
        <p className="mt-2 text-sm text-red-500">{buy.error instanceof ApiError ? buy.error.message : 'Could not buy this number.'}</p>
      )}
      {confirming && (
        <ConfirmDialog
          onCancel={() => setConfirming(null)}
          onContinue={() => {
            const { tier } = confirming;
            setConfirming(null);
            buy.mutate({ service: service.id, country: country.id, tier }, { onSuccess: (d) => onBought(d.activation.id) });
          }}
        />
      )}
    </div>
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

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">{children}</div>;
}

// Cyrillic letters that look like Latin ones: provider names such as "1хbet" use them, so a plain "1xbet" must still match.
const LOOKALIKES: Record<string, string> = { а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i' };

/** Lowercase, no accents, lookalikes folded to Latin, punctuation and spaces dropped ("X (Twitter)" -> "xtwitter"). */
const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[а-яі]/g, (ch) => LOOKALIKES[ch] ?? ch)
    .replace(/[^\p{L}\p{N}]/gu, '');

const MAX_SHOWN = 100; // a server can list 1,000+ services: draw the first ones and let the search narrow the rest

/** Names that start with the search first, then ones with a word that starts with it, then the rest. Original order within each. */
function search(items: CatalogItem[], query: string): CatalogItem[] {
  const q = fold(query);
  if (!q) return items;
  const ranked: Array<[number, CatalogItem]> = [];
  for (const item of items) {
    const name = fold(item.name);
    if (!name.includes(q)) continue;
    const startsWord = item.name.split(/[^\p{L}\p{N}]+/u).some((w) => fold(w).startsWith(q));
    ranked.push([name.startsWith(q) ? 0 : startsWord ? 1 : 2, item]);
  }
  return ranked.sort((a, b) => a[0] - b[0]).map(([, item]) => item);
}

/** Search box + scrolling list. Once something is picked it collapses to one row with a × to change it. */
function Picker({
  items,
  selected,
  placeholder,
  onSelect,
  onClear,
}: {
  items: CatalogItem[];
  selected: CatalogItem | null;
  placeholder: string;
  onSelect: (item: CatalogItem) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border p-2">
        <p className="text-sm">{selected.name}</p>
        <button
          type="button"
          aria-label="Change"
          onClick={onClear}
          className="px-2 text-xl font-bold leading-none text-red-500 hover:text-red-600"
        >
          ×
        </button>
      </div>
    );
  }

  const matches = search(items, query);
  const shown = matches.slice(0, MAX_SHOWN);

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="mb-2 w-full rounded-lg border border-border bg-surface p-2 text-sm outline-none transition-colors focus:border-accent"
      />
      <ul className="max-h-96 space-y-2 overflow-y-auto">
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-sm transition-colors hover:bg-surface-2"
            >
              <span className="h-3.5 w-3.5 rounded-full border border-border-strong" />
              <span className="flex-1">{item.name}</span>
              {item.costKobo !== undefined && (
                <span className="text-xs text-muted">
                  {formatNaira(item.costKobo)} · {item.stock} in stock
                </span>
              )}
            </button>
          </li>
        ))}
        {matches.length > shown.length && <li className="py-2 text-center text-xs text-muted">Type to narrow {matches.length} results.</li>}
        {shown.length === 0 && <li className="py-2 text-sm text-muted">Nothing found.</li>}
      </ul>
    </>
  );
}
