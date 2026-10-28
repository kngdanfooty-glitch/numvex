import type { MetadataRoute } from 'next';

// What the phone needs to install NumVex like an app. It opens on the dashboard: signed-out visitors are sent to /login first
// (proxy.ts) and come straight back after signing in.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'NumVex',
    short_name: 'NumVex',
    description: 'Virtual numbers, boosting and number rentals. One wallet, instant delivery, automatic refunds.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    categories: ['utilities', 'finance'],
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Fund wallet', short_name: 'Fund', url: '/dashboard/wallet' },
      { name: 'Buy a number', short_name: 'Numbers', url: '/dashboard/usa' },
      { name: 'My orders', short_name: 'Orders', url: '/dashboard/orders' },
    ],
  };
}
