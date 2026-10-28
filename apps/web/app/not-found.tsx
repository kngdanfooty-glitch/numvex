import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icons';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

export const metadata: Metadata = {
  title: 'Page not found',
};

const LINKS: { href: string; icon: IconName; label: string; hint: string }[] = [
  { href: '/#services', icon: 'number', label: 'Services', hint: 'Numbers, boosting, rentals' },
  { href: '/#how-it-works', icon: 'bolt', label: 'How it works', hint: 'Fund, order, done' },
  { href: '/login', icon: 'profile', label: 'Sign in', hint: 'Access your account' },
];

// Shown for every URL that doesn't match a route (Next.js looks for app/not-found.tsx).
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center py-16 sm:py-24">
        <Container size="narrow" className="text-center">
          {/* Big "404" — the 0 is a little phone with a missing signal */}
          <div
            className="mt-4 flex items-center justify-center gap-2 text-[7rem] font-extrabold leading-none sm:gap-4 sm:text-[10rem]"
            aria-hidden
          >
            <span>4</span>
            <span className="grid h-[6rem] w-[6rem] place-items-center rounded-[1.75rem] bg-accent text-accent-contrast shadow-[0_24px_50px_-20px_var(--accent-ring)] sm:h-[8.5rem] sm:w-[8.5rem] sm:rounded-[2.25rem]">
              <Icon name="number" size={64} strokeWidth={1.6} />
            </span>
            <span>4</span>
          </div>

          <h1 className="section-kicker mt-8 text-3xl font-extrabold sm:text-5xl">
            This page <span className="text-accent">didn&apos;t get its code.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted">
            The page you&apos;re looking for doesn&apos;t exist, was moved, or the link is wrong.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/" size="lg">
              Back to home <Icon name="arrow" size={18} />
            </Button>
            <Button href="/#services" variant="outline" size="lg">
              Browse services
            </Button>
          </div>

          <ul className="mt-14 grid gap-3 text-left sm:grid-cols-3">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_16px_32px_-22px_rgba(37, 99, 235,0.5)]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Icon name={l.icon} size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{l.label}</span>
                    <span className="block truncate text-xs text-faint">{l.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
