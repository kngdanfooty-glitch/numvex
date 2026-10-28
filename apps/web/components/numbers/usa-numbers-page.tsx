'use client';

import { useState } from 'react';
import { USA_SERVERS, type UsaServerId } from '@numvexs/shared';
import { ServerPanel } from './server-panel';
import { ServerTabs } from './server-tabs';
import { useActiveNumber } from './use-active-number';

const TAB_KEY = 'mhub_usa_tab';

function savedTab(): UsaServerId {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return USA_SERVERS.find((s) => s.id === saved)?.id ?? USA_SERVERS[0].id;
  } catch {
    return USA_SERVERS[0].id;
  }
}

/** USA numbers on their own page, FloZap style: one tab per server, no country step. */
export function UsaNumbersPage() {
  const [tab, setTab] = useState<UsaServerId>(savedTab);
  const { bought, node } = useActiveNumber();

  const pick = (id: UsaServerId) => {
    setTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {}
  };

  return (
    <div className="mx-auto max-w-5xl pb-8">
      <h1 className="section-kicker text-2xl font-extrabold">USA Numbers</h1>
      <p className="mb-4 mt-1 text-sm text-muted">
        Purchase from any server of your choice. Not getting a code? Cancel and you are refunded.
      </p>

      {node}

      <ServerTabs tabs={USA_SERVERS} active={tab} onPick={pick} />

      {/* key = tab, so each server's panel mounts fresh and only that server is asked for data */}
      <ServerPanel key={tab} server={tab} onBought={bought} />
    </div>
  );
}
