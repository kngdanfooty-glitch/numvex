'use client';

import { useState, type ReactNode } from 'react';
import { ActivationModal } from './activation-modal';

const ACTIVE_KEY = 'mhub_active_number'; // the number being waited on, so a reload doesn't lose it

function saved(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/**
 * Both number pages use this. Call `bought(id)` after a purchase and render `node` once near the top:
 * it shows the number's modal, or a banner to reopen it if it was hidden while still waiting.
 */
export function useActiveNumber(): { bought: (id: string) => void; node: ReactNode } {
  const [activeId, setActiveId] = useState<string | null>(saved);
  const [showModal, setShowModal] = useState(activeId !== null);

  const bought = (id: string) => {
    setActiveId(id);
    setShowModal(true);
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {}
  };
  const close = (finished: boolean) => {
    setShowModal(false);
    if (!finished) return; // still waiting: keep it so the banner can bring it back
    setActiveId(null);
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  };

  const node = activeId ? (
    showModal ? (
      <ActivationModal id={activeId} onClose={close} />
    ) : (
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="mb-4 w-full rounded-xl border border-accent bg-accent-soft p-3 text-left text-sm font-bold text-accent"
      >
        You have a number in progress. Tap to view it.
      </button>
    )
  ) : null;

  return { bought, node };
}
