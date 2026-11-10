'use client';

import { useEffect } from 'react';
import { rememberSource } from '@/lib/source';

/** Remembers `?source=` (or `utm_source`) from the first link a visitor lands on, on any page. */
export function SourceCapture() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    rememberSource(q.get('source') ?? q.get('utm_source'));
  }, []);
  return null;
}
