'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { formatNaira } from '@numvexs/shared';
import { Icon } from '@/components/ui/icons';
import { Logo } from '@/components/marketing/logo';
import { useLogout, useMe } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { ACCOUNT, MENU, type NavItem } from './nav';
import { NAV_TONE, TONES } from './tones';

function NavGroup({ label, items, onNavigate }: { label: string; items: NavItem[]; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <div>
      <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-faint">{label}</div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          // "/dashboard" must only match exactly, the others match their sub-pages too.
          const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-xl px-2.5 text-sm font-semibold transition-colors',
                  active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text',
                )}
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                  style={{ backgroundColor: TONES[NAV_TONE[item.href] ?? 'teal'].soft, color: TONES[NAV_TONE[item.href] ?? 'teal'].text }}
                >
                  <Icon name={item.icon} size={15} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const logout = useLogout();
  const me = useMe().data?.user;
  const isAdmin = me?.role === 'admin'; // only a convenience: the server checks the role on every admin call

  const onLogout = () => logout.mutate(undefined, { onSettled: () => router.replace('/login') });

  return (
    <>
      {/* Dim overlay behind the drawer on phones/tablets */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn('fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-border bg-surface px-4 py-6 transition-transform duration-200',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between pl-1">
          <Logo href="/dashboard" />
          <button onClick={onClose} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 lg:hidden">
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-6 overflow-y-auto">
          <NavGroup label="Services" items={MENU} onNavigate={onClose} />
          <NavGroup label="Account" items={isAdmin ? [...ACCOUNT, { href: '/admin', label: 'Admin', icon: 'shield' }] : ACCOUNT} onNavigate={onClose} />
        </nav>

        {/* Wallet card: the balance is always one tap from topping up */}
        <div className="mt-4 overflow-hidden rounded-2xl bg-[#1e40af] p-4 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Wallet</div>
          <div className="mt-1 text-xl font-extrabold">{formatNaira(me?.balanceKobo ?? 0)}</div>
          <Link
            href="/dashboard/wallet"
            onClick={onClose}
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-white text-[13px] font-bold text-[#1e40af] transition-colors hover:bg-[#e4e4e7]"
          >
            <Icon name="plus" size={14} /> Fund wallet
          </Link>
        </div>

        <button
          onClick={onLogout}
          disabled={logout.isPending}
          className="mt-3 flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
        >
          <Icon name="logout" size={18} />
          Log out
        </button>
      </aside>
    </>
  );
}
