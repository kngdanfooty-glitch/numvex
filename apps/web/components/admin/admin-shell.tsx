'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminMe, ModuleKey } from '@numvexs/shared';
import { Logo } from '@/components/marketing/logo';
import { Icon, type IconName } from '@/components/ui/icons';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAdminMe } from '@/lib/admin-hooks';
import { useLogout } from '@/lib/hooks';

/*
 * The frame around every /admin page. The menu only shows what this admin may open (from /admin/me), but that is a convenience:
 * the server checks the same rule on every request, so typing a hidden address still gets "no access".
 */
interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Shown when the admin has ANY of these modules. */
  modules: ModuleKey[] | 'super';
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard', modules: ['dashboard'] },
  { href: '/admin/users', label: 'Users', icon: 'usercircle', modules: ['users'] },
  { href: '/admin/cases', label: 'Needs attention', icon: 'shield', modules: ['wallet', 'orders'] },
  { href: '/admin/deposits', label: 'Deposits', icon: 'bank', modules: ['wallet'] },
  { href: '/admin/orders', label: 'Orders', icon: 'orders', modules: ['orders'] },
  { href: '/admin/finance', label: 'Finance', icon: 'history', modules: ['reports'] },
  { href: '/admin/pricing', label: 'Pricing', icon: 'sliders', modules: ['prices'] },
  { href: '/admin/services', label: 'Services', icon: 'bolt', modules: ['settings'] },
  { href: '/admin/team', label: 'Admin team', icon: 'idcard', modules: 'super' },
  { href: '/admin/audit', label: 'Audit log', icon: 'key', modules: 'super' },
];

const AdminContext = createContext<{ me: AdminMe; can: (m: ModuleKey) => boolean } | null>(null);
export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside the admin pages');
  return ctx;
};

/** Wrap a page's content: shows a plain "no access" card when this admin doesn't have the section. */
export function NeedModule({ module, children }: { module: ModuleKey | ModuleKey[]; children: ReactNode }) {
  const { can } = useAdmin();
  const list = Array.isArray(module) ? module : [module];
  if (!list.some(can)) return <NoAccess />;
  return <>{children}</>;
}
export function NeedSuper({ children }: { children: ReactNode }) {
  const { me } = useAdmin();
  return me.isSuperAdmin ? <>{children}</> : <NoAccess />;
}
function NoAccess() {
  return <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-5 text-sm text-muted">You don&apos;t have access to this section. Ask a super admin if you need it.</div>;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useAdminMe();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);

  const notSignedIn = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (notSignedIn) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [notSignedIn, pathname, router]);
  useEffect(() => setMenuOpen(false), [pathname]);

  if (me.isPending || notSignedIn) {
    return (
      <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
      </div>
    );
  }
  if (me.isError) {
    const denied = me.error instanceof ApiError && me.error.status === 403;
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-extrabold">{denied ? 'No access' : "Can't reach NumVex right now"}</h1>
          <p className="mt-2 text-sm text-muted">{denied ? 'This area is for admins only.' : 'Check your connection and try again.'}</p>
          <Link href="/dashboard" className="mt-5 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-bold text-white">
            Back to my dashboard
          </Link>
        </div>
      </div>
    );
  }

  const admin = me.data.admin;
  const can = (m: ModuleKey) => admin.permissions.includes(m);
  const visible = NAV.filter((i) => (i.modules === 'super' ? admin.isSuperAdmin : i.modules.some(can)));

  return (
    <AdminContext.Provider value={{ me: admin, can }}>
      <div className="dash-root dash-bg min-h-screen" data-theme="light">
        <div onClick={() => setMenuOpen(false)} aria-hidden className={cn('fixed inset-0 z-40 bg-[#18181b]/50 backdrop-blur-sm transition-opacity lg:hidden', menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0')} />

        <aside className={cn('dash-sidebar fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col px-4 py-[30px] text-white transition-transform duration-200 lg:translate-x-0', menuOpen ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex items-center justify-between pl-2">
            <Logo href="/admin" variant="outline" />
            <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden">
              <Icon name="close" size={20} />
            </button>
          </div>
          <p className="mt-5 px-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">Admin</p>
          <nav className="mt-3 flex flex-1 flex-col gap-0.5 overflow-y-auto">
            {visible.map((item) => {
              const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex h-[42px] items-center gap-3.5 rounded-[10px] px-3.5 text-[14.5px] font-semibold transition-colors', active ? 'bg-[#2563eb] text-white shadow-[0_8px_22px_-8px_rgba(37, 99, 235,0.9)]' : 'text-[#bfdbfe] hover:bg-white/8 hover:text-white')}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Link href="/dashboard" className="mt-4 flex h-[42px] items-center gap-3.5 rounded-[10px] px-3.5 text-[14.5px] font-semibold text-[#bfdbfe] transition-colors hover:bg-white/8 hover:text-white">
            <Icon name="back" size={18} />
            Back to site
          </Link>
          <button onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })} disabled={logout.isPending} className="mt-1 flex h-[42px] items-center gap-3.5 rounded-[10px] px-3.5 text-[14.5px] font-semibold text-[#ff7b86] transition-colors hover:bg-white/8 disabled:opacity-60">
            <Icon name="logout" size={18} />
            Logout
          </button>
        </aside>

        <div className="lg:pl-[250px]">
          <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-border bg-surface/90 px-5 backdrop-blur sm:px-[30px]">
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-lg border border-border lg:hidden">
              <Icon name="menu" size={20} />
            </button>
            <span className="hidden text-sm font-bold lg:block">Admin panel</span>
            <div className="text-right text-xs">
              <p className="font-bold">{admin.email}</p>
              <p className="text-muted">{admin.isSuperAdmin ? 'Super admin' : admin.adminRole.replace(/_/g, ' ')}</p>
            </div>
          </header>
          <main className="px-5 pb-16 pt-[26px] sm:px-[30px]">{children}</main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
