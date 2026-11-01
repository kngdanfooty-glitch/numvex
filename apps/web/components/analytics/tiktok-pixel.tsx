'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

declare global {
  interface Window {
    ttq?: { page: () => void; track: (event: string, params?: Record<string, unknown>) => void };
  }
}

/** Fires a TikTok `PageView` on client-side route changes. The first view is sent by the base code in the root layout. */
export function TiktokPageViews() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.ttq?.page();
  }, [pathname]);
  return null;
}
