'use client';

import { useState } from 'react';
import { NUMBER_SERVERS, type NumberServerId } from '@numvexs/shared';
import { ServerPanel } from './server-panel';
import { ServerTabs } from './server-tabs';
import { useActiveNumber } from './use-active-number';

const TAB_KEY = 'mhub_numbers_tab';

function savedTab(): NumberServerId {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return NUMBER_SERVERS.find((s) => s.id === saved)?.id ?? NUMBER_SERVERS[0].id;
  } catch {
    return NUMBER_SERVERS[0].id;
  }
}

/** Every server except the USA-only ones (those have their own page, /dashboard/usa). */
export function NumbersPage() {
  const [tab, setTab] = useState<NumberServerId>(savedTab);
  const { bought, node } = useActiveNumber();

  const pick = (id: NumberServerId) => {
    setTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {}
  };

  return (
    <div className="mx-auto max-w-5xl pb-8">
      <h1 className="section-kicker text-2xl font-extrabold">Buy Numbers</h1>
      <p className="mb-4 mt-1 text-sm text-muted">
        Purchase from any server of your choice — higher-priced numbers usually have better success rates.
      </p>

      {node}

      <ServerTabs tabs={NUMBER_SERVERS} active={tab} onPick={pick} />

      {/* key = tab, so switching tabs mounts a fresh panel, and only that panel asks its server for data */}
      <ServerPanel key={tab} server={tab} onBought={bought} />
    </div>
  );
}
