import { ImageResponse } from 'next/og';

/*
 * The NumVex logo (an "N" whose diagonal ends in a node at the top right) drawn as a PNG for the browser tab, the iPhone home screen and the
 * installed-app icon. One drawing, three uses, so they can never drift apart from the logo in components/marketing/logo.tsx.
 *
 *   maskable: Android may crop an icon into a circle or squircle, so the artwork has to sit inside the middle ~60% on a
 *             full-bleed background. Non-maskable icons use rounded corners instead.
 */
const BLUE = '#2563eb';

export function renderIcon(size: number, opts: { maskable?: boolean; square?: boolean } = {}) {
  const art = Math.round(size * (opts.maskable ? 0.56 : 0.62));
  const radius = opts.maskable || opts.square ? 0 : Math.round(size * 0.22);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BLUE, borderRadius: radius }}>
        <svg width={art} height={art} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.5 19V6l11 12" strokeWidth="2.6" />
          <circle cx="18.5" cy="5.5" r="1.9" fill="#ffffff" stroke="none" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
