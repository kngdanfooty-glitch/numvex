/*
 * The dashboard's colours: tonal and calm. Teal is the brand colour; each service also gets a quiet colour of its own.
 * An icon sits on a soft tinted tile (`soft`, a translucent tint so it also works on the dark theme) in a muted version of the
 * same hue (`text`). No gradients, no glow.
 */
export interface Tone {
  soft: string;
  text: string;
}

const tone = (rgb: string, text: string): Tone => ({ soft: `rgba(${rgb},0.11)`, text });

export const TONES = {
  blue: tone('47,111,208', '#3b78d8'),
  teal: tone('37, 99, 235', '#3b82f6'),
  pink: tone('194,69,122', '#cc4f86'),
  orange: tone('201,122,28', '#cc7f22'),
  indigo: tone('91,91,214', '#6464d8'),
  green: tone('47,158,92', '#34a363'),
  amber: tone('183,121,31', '#c48524'),
  rose: tone('208,72,95', '#d4506a'),
  violet: tone('124,92,214', '#8466d8'),
  sky: tone('42,139,196', '#3190c8'),
} as const;

export type ToneName = keyof typeof TONES;

/** The colour of each menu item (by its link). */
export const NAV_TONE: Record<string, ToneName> = {
  '/dashboard': 'teal',
  '/dashboard/usa': 'blue',
  '/dashboard/numbers': 'teal',
  '/dashboard/boost': 'pink',
  '/dashboard/wallet': 'green',
  '/dashboard/history': 'amber',
  '/dashboard/orders': 'sky',
  '/dashboard/profile': 'violet',
  '/admin': 'rose',
};
