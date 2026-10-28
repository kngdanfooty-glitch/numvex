import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * variant "solid"   - teal tile, for light backgrounds (landing page, auth).
 * variant "outline" - transparent tile with a light-teal outline, for the dark sidebar.
 */
export function Logo({
  className,
  href = '/',
  variant = 'solid',
}: {
  className?: string;
  href?: string;
  variant?: 'solid' | 'outline';
}) {
  const outline = variant === 'outline';
  return (
    <Link href={href} className={cn('flex items-center gap-2.5 font-extrabold', className)}>
      <span
        aria-hidden
        className={cn(
          'grid place-items-center rounded-xl',
          outline
            ? 'h-10 w-10 border-2 border-[#60a5fa] text-[#60a5fa]'
            : 'h-9 w-9 bg-accent text-accent-contrast shadow-[0_8px_20px_-8px_var(--accent-ring)]',
        )}
      >
        {/* an "N" whose diagonal ends in a node at the top right */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.5 19V6l11 12" strokeWidth="2.6" />
          <circle cx="18.5" cy="5.5" r="1.9" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className={cn('text-[22px] tracking-tight', outline && 'text-white')}>
        Num<span className={outline ? 'text-[#60a5fa]' : 'text-accent'}>Vex</span>
      </span>
    </Link>
  );
}
