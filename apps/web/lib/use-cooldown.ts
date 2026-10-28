'use client';

import { useCallback, useEffect, useState } from 'react';

/** Counts down `seconds` after `start()`; `remaining === 0` means ready. */
export function useCooldown(seconds: number, startActive = false) {
  const [remaining, setRemaining] = useState(startActive ? seconds : 0);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);
  return { remaining, start };
}
