import type { IconName } from '@/components/ui/icons';

export const HERO_STATS = [
  { value: '200+', label: 'Countries' },
  { value: '99.9%', label: 'Uptime' },
  { value: '<10s', label: 'Avg. delivery' },
  { value: '24/7', label: 'Automated' },
] as const;

/** Platforms people use NumVex for (plain names, no logos). */
export const PLATFORMS = ['WhatsApp', 'Telegram', 'Google', 'Instagram', 'TikTok', 'YouTube', 'Facebook', 'X', 'Snapchat', 'Amazon', 'Steam', 'Apple'] as const;

export const SERVICES = {
  numbers: {
    icon: 'number' as IconName,
    title: 'Virtual numbers',
    body: 'Receive one-time codes for WhatsApp, Telegram, Google and 1,000+ platforms in 200+ countries. Pick a country, pick a service, get the code in seconds.',
    chips: ['WhatsApp', 'Telegram', 'Google', '200+ countries'],
  },
  boosting: {
    icon: 'boost' as IconName,
    title: 'Boosting',
    body: 'Followers, likes, views and engagement that start fast and hold steady on every major platform.',
  },
  rentals: {
    icon: 'key' as IconName,
    title: 'Number rentals',
    body: 'Keep a number for days or weeks instead of minutes, so the same number can receive codes again and again.',
    chips: ['Daily', 'Weekly', 'Monthly'],
  },
} as const;

export const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Fund your wallet',
    body: 'Top up by bank transfer. Your balance posts the moment the payment clears.',
  },
  {
    step: '02',
    title: 'Choose and order',
    body: 'Pick a number, a boost or a rental and hit buy. It shows up in your dashboard in seconds.',
  },
  {
    step: '03',
    title: 'Delivered or refunded',
    body: 'No code on a number or a failed order? Your wallet is credited back automatically.',
  },
] as const;

export const WHY: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'bolt',
    title: 'Instant, every time',
    body: 'Orders resolve in seconds, around the clock, fully automated.',
  },
  {
    icon: 'refund',
    title: 'Refunds that run themselves',
    body: 'A failed order credits your wallet back on its own. No forms, no waiting on support.',
  },
  {
    icon: 'shield',
    title: 'Private by default',
    body: 'Minimal data, encrypted sessions, and we never resell your information.',
  },
  {
    icon: 'wallet',
    title: 'One wallet for everything',
    body: 'Numbers, boosts and rentals all draw from the same balance, priced in naira.',
  },
];

export const PERKS = ['Pay per use, no subscription', 'Live order history', 'Automatic refunds', '24/7 delivery'] as const;
