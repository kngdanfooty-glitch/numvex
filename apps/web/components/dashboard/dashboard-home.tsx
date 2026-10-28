'use client';

import Link from 'next/link';
import { formatNaira } from '@numvexs/shared';
import { Icon, type IconName } from '@/components/ui/icons';
import { useHistory, useMe } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { TONES, type ToneName } from './tones';

const SERVICES: { href: string; icon: IconName; title: string; body: string; tone: ToneName; soon?: boolean }[] = [
  { href: '/dashboard/usa', icon: 'number', title: 'USA numbers', body: 'US numbers, high success rate', tone: 'blue' },
  { href: '/dashboard/numbers', icon: 'number', title: 'Numbers', body: '1,000+ platforms, 200+ countries', tone: 'teal' },
  { href: '/dashboard/boost', icon: 'boost', title: 'Boosting', body: 'Followers, likes and views', tone: 'pink' },
  { href: '/dashboard/telegram', icon: 'bluetick', title: 'Telegram', body: 'Premium and Stars, activated fast', tone: 'sky' },
  { href: '/dashboard/rentals', icon: 'key', title: 'Number rentals', body: 'Keep a number for days or months', tone: 'indigo' },
  { href: '/dashboard/esim', icon: 'esim', title: 'eSIMs', body: 'Travel & data eSIMs by QR code', tone: 'teal' },
];

const QUICK: { href: string; icon: IconName; label: string; tone: ToneName }[] = [
  { href: '/dashboard/orders', icon: 'orders', label: 'My orders', tone: 'sky' },
  { href: '/dashboard/history', icon: 'history', label: 'History', tone: 'amber' },
  { href: '/dashboard/support', icon: 'support', label: 'Support', tone: 'rose' },
  { href: '/dashboard/profile', icon: 'profile', label: 'Profile', tone: 'violet' },
];

const KIND_ICON: Record<string, IconName> = { deposit: 'bank', number: 'number', boost: 'boost', esim: 'esim', rental: 'key', telegram: 'bluetick' };
const KIND_TONE: Record<string, ToneName> = { deposit: 'green', number: 'teal', boost: 'pink', esim: 'teal', rental: 'indigo', telegram: 'sky' };

const dayTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function DashboardHome() {
  const me = useMe();
  const history = useHistory();

  // The shell guarantees `me.data` exists before rendering us.
  const user = me.data?.user;
  if (!user) return null;

  const recent = (history.data?.pages[0]?.entries ?? []).slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      {/* Balance: a slim bar, so the services are on the first screen */}
      <section className="relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl bg-[#1e40af] px-5 py-4 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/[0.06]" />
        <div className="relative min-w-0">
          <div className="text-xs font-medium text-white/70">Available balance</div>
          <div className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{formatNaira(user.balanceKobo)}</div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          <Link href="/dashboard/history" className="hidden h-10 items-center rounded-xl border border-white/30 px-4 text-sm font-bold transition-colors hover:bg-white/10 sm:inline-flex">
            History
          </Link>
          <Link href="/dashboard/wallet" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-bold text-[#1e40af] transition-colors hover:bg-[#e4e4e7]">
            <Icon name="plus" size={15} /> Fund wallet
          </Link>
        </div>
      </section>

      {/* Services: compact cards, right under the balance */}
      <section>
        <h2 className="mb-3 text-base font-extrabold">What do you need?</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {SERVICES.map((s) => {
            const t = TONES[s.tone];
            const inner = (
              <>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11" style={{ backgroundColor: t.soft, color: t.text }}>
                  <Icon name={s.icon} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-bold leading-tight">{s.title}</span>
                    {s.soon ? (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: t.soft, color: t.text }}>
                        Soon
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 hidden truncate text-xs text-muted sm:block">{s.body}</span>
                </span>
              </>
            );
            // Not built yet: shown, but not a link (the page does not exist).
            return s.soon ? (
              <div key={s.title} className="flex items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface/60 p-3 last:col-span-2 sm:p-3.5 lg:last:col-span-1">
                {inner}
              </div>
            ) : (
              <Link
                key={s.title}
                href={s.href}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-2 sm:p-3.5"
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Quick links: one small row */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK.map((q) => {
          const t = TONES[q.tone];
          return (
            <Link key={q.label} href={q.href} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: t.soft, color: t.text }}>
                <Icon name={q.icon} size={16} />
              </span>
              <span className="truncate text-[13px] font-semibold">{q.label}</span>
            </Link>
          );
        })}
      </section>

      {/* Recent activity: the latest few entries from the money history */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-extrabold">Recent activity</h2>
          <Link href="/dashboard/history" className="text-sm font-bold text-accent hover:underline">
            View all
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {history.isPending ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Nothing yet. Fund your wallet and place your first order.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((e) => {
                const t = TONES[e.type === 'refund' ? 'amber' : KIND_TONE[e.kind] ?? 'teal'];
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: t.soft, color: t.text }}>
                      <Icon name={e.type === 'refund' ? 'refund' : KIND_ICON[e.kind] ?? 'orders'} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{e.title}</p>
                      <p className="truncate text-xs text-muted">{dayTime(e.createdAt)}{e.detail ? ` · ${e.detail}` : ''}</p>
                    </div>
                    <span className={cn('shrink-0 text-sm font-extrabold', e.amountKobo > 0 ? 'text-success' : 'text-text')}>
                      {e.amountKobo > 0 ? '+' : '−'}
                      {formatNaira(Math.abs(e.amountKobo))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
