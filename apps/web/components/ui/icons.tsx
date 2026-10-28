import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'number'
  | 'boost'
  | 'bluetick'
  | 'esim'
  | 'wallet'
  | 'bolt'
  | 'shield'
  | 'refund'
  | 'check'
  | 'arrow'
  | 'api'
  | 'globe'
  | 'dashboard'
  | 'history'
  | 'orders'
  | 'profile'
  | 'logout'
  | 'plus'
  | 'menu'
  | 'close'
  | 'moon'
  | 'sun'
  | 'support'
  | 'back'
  | 'idcard'
  | 'lock'
  | 'key'
  | 'mail'
  | 'calendar'
  | 'checkcircle'
  | 'save'
  | 'sliders'
  | 'usercircle'
  | 'bank'
  | 'bitcoin'
  | 'search'
  | 'folder'
  | 'chevron'
  | 'minus'
  | 'cart'
  | 'link'
  | 'tag'
  | 'info'
  | 'phone';

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  orders: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
  logout: <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  idcard: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.6-1.6 1.7-2.3 3-2.3s2.4.7 3 2.3M15 10h3M15 14h3" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="11" width="15" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 8l9 6 9-6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  checkcircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h11l4 4v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M8 3v5h7V3M8 21v-7h8v7" />
    </>
  ),
  sliders: <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0M14 5v4M10 10v4M18 15v4" />,
  usercircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18c1.2-2 3-3 5.5-3s4.3 1 5.5 3" />
    </>
  ),
  bank: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  bitcoin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8v8M10 8h3a2 2 0 010 4h-3M10 12h3.5a2 2 0 010 4H10M11.5 6.5V8M11.5 16v1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  minus: <path d="M5 12h14" />,
  cart: (
    <>
      <path d="M3 4h2.5l2 11h10l2-8H7" />
      <circle cx="9" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1" />,
  tag: (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  support: (
    <>
      <path d="M4 14v-2a8 8 0 0116 0v2" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
      <path d="M19 20c0 1-1.5 1.5-4 1.5" />
    </>
  ),
  number: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  boost: <path d="M4 15l5-5 4 4 7-8M15 6h5v5" />,
  esim: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M10 12h5v5h-5z" />
    </>
  ),
  bluetick: (
    <>
      <path d="M12 2.5l2.4 1.8 3-.1.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3-.1L12 21.5l-2.4-1.8-3 .1-.9-2.9L3.3 15l.9-2.9-.9-2.9 2.4-1.8.9-2.9 3 .1z" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 016.5 5H19v14H6.5A2.5 2.5 0 014 16.5z" />
      <path d="M16 12h3" />
    </>
  ),
  bolt: <path d="M13 2L5 13h6l-1 9 8-11h-6z" />,
  shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />,
  refund: (
    <>
      <path d="M4 12a8 8 0 108-8 8 8 0 00-5.7 2.4L4 8.5" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  api: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
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
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
