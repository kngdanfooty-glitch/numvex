'use client';

import { useEffect } from 'react';

/** Starts the service worker (public/sw.js) once the page has loaded. Production only, so it never gets in the way of local development. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const start = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    if (document.readyState === 'complete') start();
    else {
      window.addEventListener('load', start, { once: true });
      return () => window.removeEventListener('load', start);
    }
  }, []);
  return null;
}
