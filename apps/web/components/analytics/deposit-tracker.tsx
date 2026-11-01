'use client';

import { useEffect } from 'react';
import { koboToNaira } from '@numvexs/shared';
import { useDeposits, useMe } from '@/lib/hooks';
import { identifyTikTokUser, trackTikTokEvent } from '@/lib/tiktok';

const SEEN_KEY = 'numvexs-tt-deposits';

/**
 * Wallet funding happens by bank transfer outside the app, so there is no "payment succeeded" moment in the browser.
 * Instead, watch the deposit list and send TikTok `CompletePayment` once for each deposit not seen before.
 * The first run only records what already exists, so old deposits are never reported.
 */
export function DepositTracker() {
  const deposits = useDeposits();
  const me = useMe();
  const list = deposits.data?.deposits;
  const email = me.data?.user.email;

  useEffect(() => {
    if (!list) return;
    try {
      const stored = localStorage.getItem(SEEN_KEY);
      const seen = new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);
      if (stored) {
        const fresh = list.filter((d) => !seen.has(d.id));
        if (fresh.length && email) identifyTikTokUser({ email });
        for (const d of fresh) {
          trackTikTokEvent('CompletePayment', {
            contents: [{ content_id: 'wallet_funding', content_type: 'product', content_name: 'Wallet Funding' }],
            value: koboToNaira(d.amountKobo),
            currency: 'NGN',
          });
        }
      }
      localStorage.setItem(SEEN_KEY, JSON.stringify(list.map((d) => d.id)));
    } catch {
      // storage blocked: skip tracking rather than risk double counting
    }
  }, [list, email]);

  return null;
}
