import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icons';

/** Simple top bar for stand-alone pages: back arrow + title on the left, theme toggle on the right. */
export function PlainHeader({
  title,
  icon,
  theme,
  onToggleTheme,
}: {
  title: string;
  icon: IconName;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  return (
    <header className="flex h-[100px] items-center justify-between px-5 sm:px-12">
      <div className="flex items-center gap-5">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <Icon name="back" size={20} />
        </Link>
        <div className="flex items-center gap-2.5 text-[20.8px] font-extrabold text-accent">
          <Icon name={icon} size={22} />
          {title}
        </div>
      </div>
      <button
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="grid h-10 w-10 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
      </button>
    </header>
  );
}
