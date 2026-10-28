import type { ReactNode } from 'react';
import type { PlatformId } from '@/lib/smm-data';
import { Icon } from '@/components/ui/icons';

// Simple one-colour glyphs (drawn with currentColor) so they follow the theme.
const GLYPHS: Partial<Record<PlatformId, ReactNode>> = {
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </>
  ),
  facebook: <path d="M14 8h3V4h-3a4 4 0 00-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5A.5.5 0 0114 8z" />,
  tiktok: <path d="M14 3v11.5a3.5 3.5 0 11-3.5-3.5M14 3c.3 2.4 1.8 4 4.5 4.2" />,
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
    </>
  ),
  twitter: <path d="M5 4l14 16M19 4L5 20" />,
  telegram: <path d="M21 4L3 11l6 2.2L18 7l-7.5 7.8V19l3-2.8L18 19.5z" />,
  discord: (
    <>
      <path d="M7 6.5c1.6-.8 3.2-1.2 5-1.2s3.4.4 5 1.2c1.8 3 2.7 6 2.7 9-1.4 1.4-3 2.2-4.8 2.6l-1-1.8M7 6.5C5.2 9.5 4.3 12.5 4.3 15.5c1.4 1.4 3 2.2 4.8 2.6l1-1.8" />
      <circle cx="9.3" cy="12.3" r="1.1" fill="currentColor" />
      <circle cx="14.7" cy="12.3" r="1.1" fill="currentColor" />
    </>
  ),
  linkedin: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 10.5V16M8 8h.01M11.5 16v-5.5M11.5 13c0-1.6 1-2.5 2.3-2.5S16 11.4 16 13v3" />
    </>
  ),
  snapchat: (
    <path d="M12 3.5c-2.6 0-4 1.8-4 4.3v2.2c-1 .3-2 .6-2.3 1 .5.8 1.3 1 2.2 1.1-.4 1.6-1.7 2.4-3 2.8.8.7 2 .8 3 1 .3.6.6 1.2 1.5 1.2s1.4-.8 2.6-.8 1.7.8 2.6.8 1.2-.6 1.5-1.2c1-.2 2.2-.3 3-1-1.3-.4-2.6-1.2-3-2.8.9-.1 1.7-.3 2.2-1.1-.3-.4-1.300-.7-2.300-1V7.800c0-2.500-1.400-4.300-4-4.300z" />
  ),
  spotify: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 9.5c3-1 6.500-.8 9 .8M8 12.500c2.500-.7 5-.5 7.300.8M8.500 15.300c2-.5 3.800-.3 5.600.6" />
    </>
  ),
  website: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.500 2.600 3.700 5.600 3.700 9s-1.200 6.400-3.700 9c-2.500-2.600-3.700-5.600-3.700-9S9.500 5.600 12 3z" />
    </>
  ),
};

/** Brand-style icon for a platform. "other" falls back to a generic grid icon. */
export function PlatformIcon({ id, size = 20, className }: { id: PlatformId; size?: number; className?: string }) {
  const glyph = GLYPHS[id];
  if (!glyph) return <Icon name="dashboard" size={size} className={className} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {glyph}
    </svg>
  );
}
