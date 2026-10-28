'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * FloZap's server tab bar: a bordered box holding one button per server, the active one filled.
 * On phones the row scrolls sideways and snaps, with a fade at each edge, and the active tab is
 * scrolled into view.
 */
export function ServerTabs<T extends string>({
  tabs,
  active,
  onPick,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onPick: (id: T) => void;
}) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [active]);

  return (
    <div className="relative mb-4">
      <div
        className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto rounded-xl border border-border bg-surface p-1.5 sm:snap-none sm:flex-wrap sm:overflow-visible"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <div key={t.id} ref={isActive ? activeRef : undefined} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onPick(t.id)}
                className={cn(
                  'h-9 cursor-pointer whitespace-nowrap rounded-lg px-4 text-sm font-bold transition-colors',
                  isActive ? 'bg-accent text-white' : 'text-muted hover:bg-surface-2',
                )}
              >
                {t.label}
              </button>
            </div>
          );
        })}
      </div>
      {/* fade hints, phones only: there is more to scroll */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-xl bg-gradient-to-r from-[var(--bg)] to-transparent sm:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-xl bg-gradient-to-l from-[var(--bg)] to-transparent sm:hidden" />
    </div>
  );
}
