'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from '@/components/ui/icons';

// Not in TypeScript's DOM types yet: Chrome and Edge fire this when the site can be installed.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __mhubInstall?: BeforeInstallPromptEvent | null; // set by the inline script in app/layout.tsx
  }
}

const DISMISSED_KEY = 'numvexs-install-dismissed';
const HIDE_FOR_MS = 30 * 24 * 60 * 60 * 1000; // after "Not now", ask again in 30 days

/*
 * What the browser tells us about itself (installed already? an iPhone? did they say "Not now" lately?). It is read as an external
 * store, so the server and the first render agree ("hidden") and the card never flashes or mismatches.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const hiddenRecently = () => {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < HIDE_FOR_MS;
  } catch {
    return false;
  }
};

/** "S" standalone (already installed), "I" iPhone/iPad in a browser, "D" dismissed recently, "-" nothing special. */
function readEnv(): string {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return 'S';
  if (hiddenRecently()) return 'D';
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'I' : '-';
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  const mq = window.matchMedia('(display-mode: standalone)');
  mq.addEventListener('change', onChange);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener('change', onChange);
  };
};

/**
 * "Install NumVex" card for the dashboard. Android and desktop Chrome get a one-tap Install button. iPhones can't be asked from a
 * page, so they get the two-step "Share, then Add to Home Screen" hint. Nothing shows once the app is installed or after "Not now".
 */
export function InstallPrompt() {
  const env = useSyncExternalStore(subscribe, readEnv, () => 'S'); // on the server: treat as installed = show nothing
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // The event may already have fired (the inline script in app/layout.tsx kept it), or may still be on its way.
    const pick = () => setEvent(window.__mhubInstall ?? null);
    const first = window.setTimeout(pick, 0);
    window.addEventListener('mhub-install-ready', pick);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener('mhub-install-ready', pick);
    };
  }, []);

  const showInstall = env === '-' && event !== null;
  const showIosHint = env === 'I';
  if (!showInstall && !showIosHint) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {}
    window.__mhubInstall = null;
    setEvent(null);
    notify();
  };

  const install = async () => {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    window.__mhubInstall = null; // an install event can only be used once
    setEvent(null);
    if (outcome !== 'accepted') dismiss();
  };

  return (
    <div role="region" aria-label="Install NumVex" className="mb-4 flex items-center gap-2.5 rounded-xl border border-border bg-surface p-2.5 text-sm sm:mb-5 sm:gap-3 sm:p-3.5">
      <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-contrast min-[360px]:grid sm:h-10 sm:w-10">
        <Icon name="phone" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold leading-tight sm:text-sm">
          Install NumVex<span className="hidden sm:inline"> on your phone</span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted sm:text-xs">
          {showInstall ? 'Open it like an app from your home screen.' : 'Tap Share, then "Add to Home Screen".'}
        </p>
      </div>
      {showInstall && (
        <button type="button" onClick={install} className="h-8 shrink-0 rounded-lg bg-accent px-3 text-xs font-bold text-accent-contrast transition-colors hover:brightness-110 sm:h-9 sm:px-4">
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Not now" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 sm:hidden">
        <Icon name="close" size={16} />
      </button>
      <button type="button" onClick={dismiss} className="hidden h-9 shrink-0 rounded-lg px-3 text-xs font-semibold text-muted hover:bg-surface-2 sm:inline-flex sm:items-center">
        Not now
      </button>
    </div>
  );
}
