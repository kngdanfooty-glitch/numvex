/**
 * Money is stored everywhere as an integer number of **kobo** (1 naira = 100 kobo).
 * Integers never suffer float rounding errors (0.1 + 0.2 !== 0.3 in JavaScript),
 * so a wallet balance is always exact.
 *
 *   ₦1,250.00 ->  125_000 kobo
 *   ₦0.50     ->       50 kobo
 */

export const KOBO_PER_NAIRA = 100;

/** Convert a naira amount (e.g. 1250.5) to integer kobo. */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * KOBO_PER_NAIRA);
}

/** Convert integer kobo to a naira number (display / calculations only). */
export function koboToNaira(kobo: number): number {
  return kobo / KOBO_PER_NAIRA;
}

/** Parse what a user typed ("1250", "₦1,250.50", "1 250") into integer kobo. NaN if it isn't a number. */
export function parseNaira(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? nairaToKobo(value) : NaN;
}

const nairaFormat = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format integer kobo for display.
 *   125_000 -> "₦1,250.00"
 *        50 -> "₦0.50"
 */
export function formatNaira(kobo: number): string {
  return nairaFormat.format(koboToNaira(kobo));
}

/** Signed display for ledger rows: "+₦420.00" / "-₦420.00". */
export function formatSignedNaira(kobo: number): string {
  const sign = kobo > 0 ? '+' : kobo < 0 ? '-' : '';
  return `${sign}${formatNaira(Math.abs(kobo))}`;
}
