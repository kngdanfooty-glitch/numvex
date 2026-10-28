'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMe } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { Sidebar } from './sidebar';
import { DashHeader } from './dash-header';
import { PlainHeader } from './plain-header';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import type { IconName } from '@/components/ui/icons';

type Theme = 'light' | 'dark';

// Stand-alone pages: a simple top bar with a back arrow and no sidebar (like the reference site).
const PLAIN_PAGES: Record<string, { title: string; icon: IconName }> = {
  '/dashboard/profile': { title: 'My Profile', icon: 'profile' },
  '/dashboard/wallet': { title: 'Fund Wallet', icon: 'wallet' },
  '/dashboard/boost': { title: 'Social Media Services', icon: 'boost' },
  '/dashboard/boost/order': { title: 'Place SMM Order', icon: 'cart' },
}
;
const THEME_KEY = 'numvexs-theme';

/**
 * The frame around every /dashboard page: sidebar on the left, header on top.
 * It also checks who is signed in. proxy.ts only checks that a cookie EXISTS;
 * asking the API (`useMe`) is what proves the session is real.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  // Read the saved theme once, when the state is created (storage can be blocked, hence try/catch).
  // Nothing themed renders until the user has loaded, so there is no server/client mismatch.
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Remember the chosen theme.
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  };

  const notSignedIn = me.error instanceof ApiError && me.error.status === 401;

  // Not signed in (or the session expired) -> go to login, and come back here afterwards.
  useEffect(() => {
    if (notSignedIn) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [notSignedIn, pathname, router]);

  // Server unreachable / unexpected error: say so, let them retry.
  if (me.isError && !notSignedIn) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-extrabold">Can&apos;t reach NumVex right now</h1>
          <p className="mt-2 text-sm text-muted">Check your connection and try again.</p>
          <Button className="mt-5" onClick={() => me.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  // Loading, or about to be redirected.
  if (!me.data) {
    return (
      <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
      </div>
    );
  }

  const plain = PLAIN_PAGES[pathname];
  if (plain) {
    return (
      <div className="dash-root min-h-screen bg-bg" data-theme={theme}>
        <PlainHeader title={plain.title} icon={plain.icon} theme={theme} onToggleTheme={toggleTheme} />
        <main className="bg-bg-elevated px-5 pb-16 pt-10 sm:px-10">{children}</main>
      </div>
    );
  }

  return (
    <div className="dash-root min-h-screen bg-bg-elevated" data-theme={theme}>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="lg:pl-[248px]">
        <DashHeader
          user={me.data.user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onMenu={() => setMenuOpen(true)}
        />
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-8 sm:pt-5">
          <InstallPrompt />
          {children}
        </main>
      </div>

      {/* Floating support button, bottom right */}
      <Link
        href="/dashboard/support"
        aria-label="Support"
        className="fixed bottom-6 right-6 z-20 grid h-[52px] w-[52px] place-items-center rounded-full bg-accent text-accent-contrast shadow-[0_14px_30px_-10px_var(--accent-ring)] transition-transform hover:-translate-y-0.5"
      >
        <Icon name="support" size={24} />
      </Link>
    </div>
  );
}
