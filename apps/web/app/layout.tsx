import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import Script from 'next/script';
import { Providers } from './providers';
import { PwaRegister } from '@/components/pwa/pwa-register';
import { TiktokPageViews } from '@/components/analytics/tiktok-pixel';
import { SourceCapture } from '@/components/analytics/source-capture';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
});

const TIKTOK_PIXEL_ID = 'DBIP0C3C77U24SKT7IDG';

const SITE_URL = 'https://numvexs.com';
const SITE_NAME = 'NumVex';
const DESCRIPTION =
  'Virtual numbers, boosting and number rentals — one wallet, instant delivery, automatic refunds.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NumVex — Numbers, Boosting & Rentals',
    template: '%s — NumVex',
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: SITE_NAME,
    title: 'NumVex — Numbers, Boosting & Rentals',
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title: SITE_NAME, description: DESCRIPTION },
  // iPhone: open from the home screen as a full-screen app (the icon is app/apple-icon.tsx).
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'default' },
  formatDetection: { telephone: false }, // numbers on the page are virtual numbers, not links to dial
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* Chrome can announce "this site is installable" before the page's own code has loaded. Catch it here and keep it for the
            "Install NumVex" card (components/pwa/install-prompt.tsx), or the card would miss it. */}
        <Script id="pwa-install-capture" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__mhubInstall=e;window.dispatchEvent(new Event('mhub-install-ready'));});window.addEventListener('appinstalled',function(){window.__mhubInstall=null;window.dispatchEvent(new Event('mhub-install-ready'));});`}
        </Script>
        {/* TikTok Pixel base code (dataset "numvex" in Events Manager). Sends the first PageView; route changes are sent by TiktokPageViews. */}
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load('${TIKTOK_PIXEL_ID}');ttq.page();}(window,document,'ttq');`}
        </Script>
        <Providers>{children}</Providers>
        <TiktokPageViews />
        <SourceCapture />
        <PwaRegister />
      </body>
    </html>
  );
}
