import Link from 'next/link';
import { formatNaira } from '@numvexs/shared';
import { capitalize } from '@/lib/name';
import type { PublicUser } from '@numvexs/shared';
import { Icon } from '@/components/ui/icons';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export function DashHeader({
  user,
  theme,
  onToggleTheme,
  onMenu,
}: {
  user: PublicUser;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-md">
      <div className="flex h-[72px] items-center justify-between gap-3 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onMenu}
            aria-label="Open menu"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface lg:hidden"
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold leading-tight sm:text-xl">
              <span className="sm:hidden">Hi</span>
              <span className="hidden sm:inline">{greeting()}</span>, {capitalize(user.username)} 👋
            </div>
            <div className="hidden text-xs text-muted sm:block">What would you like to do today?</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href="/dashboard/wallet"
            className="hidden items-center gap-2 rounded-xl border border-border bg-bg-elevated px-3.5 py-2 text-sm font-bold transition-colors hover:border-accent/40 sm:inline-flex"
          >
            <Icon name="wallet" size={16} className="text-accent" />
            {formatNaira(user.balanceKobo)}
          </Link>
          <button
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-text transition-colors hover:border-accent/40"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
          <Link
            href="/dashboard/profile"
            aria-label="Your profile"
            className="grid h-10 w-10 place-items-center rounded-full bg-accent text-base font-extrabold uppercase text-accent-contrast"
          >
            {capitalize(user.username).charAt(0)}
          </Link>
        </div>
      </div>
    </header>
  );
}
