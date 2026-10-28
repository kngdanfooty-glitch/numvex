'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';

const NAV = [
  { href: '/#services', label: 'Services' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#why', label: 'Why NumVex' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <Container size="wide" className="flex h-[68px] items-center justify-between gap-3">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3.5 py-2 text-[15px] font-medium text-muted transition-colors hover:text-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {/* Small screens: one button, "Sign in" ("Get started" lives in the menu). Larger screens: both, as before. */}
          <Button href="/login" size="sm" className="sm:hidden">
            Sign in
          </Button>
          <Button href="/login" variant="ghost" size="sm" className="max-sm:hidden">
            Sign in
          </Button>
          <Button href="/register" size="sm" className="max-sm:hidden">
            Get started
          </Button>
          <button
            className="grid h-9 w-9 place-items-center rounded-lg border border-border md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
          >
            <span className="text-lg">{open ? '×' : '☰'}</span>
          </button>
        </div>
      </Container>

      {open ? (
        // A soft blue wash (the brand's own tint, so it also works in dark mode) instead of a plain white panel.
        <div className="border-t border-accent/15 bg-[linear-gradient(135deg,var(--accent-soft),var(--bg-elevated)_55%,var(--accent-soft))] shadow-[0_18px_30px_-20px_rgba(37, 99, 235,0.45)] md:hidden">
          <Container size="wide" className="flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-semibold text-text/80 transition-colors hover:bg-accent/10 hover:text-accent"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10">
              Sign in
            </Link>
            <Link href="/register" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10">
              Get started
            </Link>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
