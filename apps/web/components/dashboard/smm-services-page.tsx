'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BOOST_SERVERS, formatNaira, type BoostServerId } from '@numvexs/shared';
import { Icon } from '@/components/ui/icons';
import { ApiError } from '@/lib/api';
import { useBoostCatalog } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { PlatformIcon } from './platform-icon';

/** Smoothly opens/closes its children by animating the grid row height between 0fr and 1fr. */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-out',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      {/* `inert` keeps hidden content out of the tab order and away from screen readers */}
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

const SERVER_KEY = 'mhub_boost_server';

function savedServer(): BoostServerId {
  try {
    const saved = localStorage.getItem(SERVER_KEY);
    return BOOST_SERVERS.find((s) => s.id === saved)?.id ?? BOOST_SERVERS[0].id;
  } catch {
    return BOOST_SERVERS[0].id;
  }
}

export function SmmServicesPage() {
  // The first server is shown (and fetched) by default; picking another fetches that one. Each is cached for 10 minutes.
  const [server, setServer] = useState<BoostServerId>(savedServer);
  const catalog = useBoostCatalog(server);
  const platforms = catalog.data?.platforms ?? null;
  const [query, setQuery] = useState('');
  const [openPlatform, setOpenPlatform] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const pick = (id: BoostServerId) => {
    setServer(id);
    setOpenPlatform(null);
    setOpenCategory(null);
    try {
      localStorage.setItem(SERVER_KEY, id);
    } catch {}
  };

  // Search: keep only what matches. A match on a platform or category name keeps everything inside it.
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!platforms) return [];
    if (!q) return platforms;
    return platforms
      .map((p) => {
        const platformHit = p.name.toLowerCase().includes(q);
        const categories = p.categories
          .map((c) => {
            const categoryHit = platformHit || c.name.toLowerCase().includes(q);
            const services = categoryHit ? c.services : c.services.filter((s) => s.name.toLowerCase().includes(q));
            return { ...c, services };
          })
          .filter((c) => c.services.length > 0);
        return { ...p, categories };
      })
      .filter((p) => p.categories.length > 0);
  }, [platforms, q]);

  const searching = q.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {/* Header card */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-6 py-[22px] shadow-[0_20px_50px_-36px_rgba(37, 99, 235,0.5)]">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#1e3a8a] text-white shadow-[0_10px_20px_-8px_var(--accent-ring)]">
            <Icon name="bolt" size={24} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-tight">
              SMM <span className="text-accent">Services</span>
            </h1>
            <p className="truncate text-[13.5px] text-faint">Boost your social presence with premium engagement</p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] bg-[#18181b] px-4 text-[12.5px] font-bold uppercase tracking-wide text-white shadow-[0_10px_20px_-10px_rgba(24, 24, 27,0.6)] transition-colors hover:bg-[#18181b] max-sm:px-3"
        >
          <Icon name="back" size={15} />
          <span className="max-sm:hidden">Dashboard</span>
        </Link>
      </div>

      {/* Server dropdown first (left), then the search box; stacked on phones. Like FloZap's filter row, in our blue. */}
      <div className="mt-[34px] flex flex-col gap-3 sm:flex-row">
        <div className="relative shrink-0 sm:w-[210px]">
          <Icon name="globe" size={19} className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-accent" />
          <select
            aria-label="Server"
            value={server}
            onChange={(e) => pick(e.target.value as BoostServerId)}
            className="h-14 w-full cursor-pointer appearance-none rounded-2xl border border-accent/25 bg-accent-soft/60 pl-[46px] pr-11 text-[15px] font-extrabold outline-none transition-colors hover:border-accent/50 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
          >
            {BOOST_SERVERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-faint" />
        </div>

        <label className="flex h-14 min-w-0 flex-1 items-center gap-3.5 rounded-2xl border border-accent/25 bg-accent-soft/60 px-[18px] focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
          <Icon name="search" size={20} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services, platforms, or categories..."
            aria-label="Search services"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
        </label>
      </div>

      {/* Platform accordion */}
      <div className="mt-[30px] flex flex-col gap-[18px]">
        {catalog.isError ? (
          <p className="rounded-2xl border border-border bg-surface px-5 py-14 text-center text-sm text-muted">
            {catalog.error instanceof ApiError ? catalog.error.message : 'Could not load this server.'}{' '}
            <button className="font-bold text-accent underline" onClick={() => catalog.refetch()}>
              Try again
            </button>
          </p>
        ) : !platforms ? (
          <div className="grid place-items-center py-16" role="status" aria-label="Loading">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-5 py-14 text-center text-sm text-muted">
            No services match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          visible.map((p) => {
            const open = searching || openPlatform === p.id;
            return (
              <section key={p.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <h2>
                  <button
                    onClick={() => {
                      setOpenPlatform(open ? null : p.id);
                      setOpenCategory(null);
                    }}
                    aria-expanded={open}
                    aria-controls={`platform-${p.id}`}
                    className={cn(
                      'flex h-[58px] w-full items-center justify-between px-5 text-left text-[17px] font-bold uppercase tracking-wide text-white transition-colors',
                      open ? 'bg-[#18181b]' : 'bg-[#18181b] hover:bg-[#18181b]',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <PlatformIcon id={p.id} size={22} className="text-[#60a5fa]" />
                      {p.name}
                    </span>
                    <Icon name={open ? 'minus' : 'plus'} size={20} />
                  </button>
                </h2>

                <Collapse open={open}>
                  <div id={`platform-${p.id}`}>
                    {p.categories.map((c) => {
                      const catOpen = searching || openCategory === c.id;
                      return (
                        <div key={c.id} className="border-t border-border first:border-t-0">
                          <button
                            onClick={() => setOpenCategory(catOpen ? null : c.id)}
                            aria-expanded={catOpen}
                            className={cn(
                              'flex min-h-[49px] w-full items-center justify-between gap-3 px-5 py-3 text-left text-[15.5px] font-bold transition-colors',
                              catOpen ? 'bg-accent-soft/70' : 'hover:bg-surface-2',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <Icon name="folder" size={18} className="shrink-0 text-accent" />
                              <span className="min-w-0">{c.name}</span>
                            </span>
                            <Icon
                              name="chevron"
                              size={18}
                              className={cn('shrink-0 text-faint transition-transform duration-300', catOpen && 'rotate-180')}
                            />
                          </button>

                          <Collapse open={catOpen}>
                            <ul>
                              {c.services.map((s) => (
                                <li
                                  key={s.id}
                                  className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-5 py-3.5 hover:bg-accent-soft/30"
                                >
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
                                    <PlatformIcon id={p.id} size={18} />
                                  </span>
                                  <div className="min-w-0 flex-1 basis-[240px]">
                                    <div className="text-[15px] font-bold leading-snug">{s.name}</div>
                                    <div className="mt-0.5 flex gap-4 text-[12px] text-faint">
                                      <span>↓ Min: {s.min.toLocaleString('en-US')}</span>
                                      <span>↑ Max: {s.max.toLocaleString('en-US')}</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[16.5px] font-extrabold text-accent">{formatNaira(s.ratePer1kKobo)}</div>
                                    <div className="text-[11px] text-faint">per 1k</div>
                                  </div>
                                  <Link
                                    href={`/dashboard/boost/order?server=${server}&service=${s.id}`}
                                    className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] px-[18px] text-[13px] font-extrabold uppercase tracking-wide text-white shadow-[0_10px_20px_-10px_var(--accent-ring)] transition-[filter] hover:brightness-110"
                                  >
                                    <Icon name="cart" size={16} />
                                    Order
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </Collapse>
                        </div>
                      );
                    })}
                  </div>
                </Collapse>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
