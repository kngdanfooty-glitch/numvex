'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { CHANNEL_URL, EXTERNAL_LINK, SUPPORT_URL, markWelcomeShown, welcomeAlreadyShown } from '@/lib/support';
import { TelegramMark } from './telegram-mark';

/**
 * Shown on the dashboard once per sign-in: reach the team, or join the channel. Either button opens Telegram and
 * closes the popup; "Maybe later" just closes it. Signing in again (lib/support.ts) makes it appear again.
 */
export function WelcomeModal({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const firstButton = useRef<HTMLAnchorElement>(null);

  // Runs in the browser only, after the first paint, so the server and browser never disagree about what to show.
  useEffect(() => {
    if (welcomeAlreadyShown()) return;
    markWelcomeShown();
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    firstButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const close = () => setOpen(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4 backdrop-blur-[2px]" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-border-strong bg-surface p-6 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.5)] sm:p-7"
      >
        <button onClick={close} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
          <Icon name="close" size={18} />
        </button>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="support" size={26} />
        </span>
        <h2 id="welcome-title" className="mt-4 text-xl font-extrabold">
          Welcome back, {name}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Need a hand with an order or a payment? Reach our team on Telegram. Or join the channel to hear about new servers and price changes first.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <a
            ref={firstButton}
            href={SUPPORT_URL}
            {...EXTERNAL_LINK}
            onClick={close}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            <TelegramMark /> Contact support
          </a>
          <a
            href={CHANNEL_URL}
            {...EXTERNAL_LINK}
            onClick={close}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-5 text-sm font-bold transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            <TelegramMark /> Join our channel
          </a>
          <button onClick={close} className="h-10 rounded-xl text-sm font-semibold text-muted transition-colors hover:text-text">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
