import { z } from 'zod';

/*
 * Nigerian mobile numbers. People type them many ways, so we accept all the common ones and
 * always store ONE standard form (E.164): "+234" followed by 10 digits.
 *
 *   0803 123 4567       (local, with the leading 0)
 *   803-123-4567        (no leading 0)
 *   +234 803 123 4567   (international)
 *   2348031234567       (international, no +)
 *
 * The 10 digits after +234 must start with a real mobile prefix: 70x, 80x, 81x, 90x or 91x
 * (MTN, Airtel, Glo, 9mobile and the other mobile networks all fall in these ranges).
 */

/** "0803 123 4567" -> "+2348031234567". Returns null if it isn't a valid Nigerian mobile number. */
export function normalizeNigerianPhone(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, ''); // drop spaces, dashes, dots and brackets

  let national: string; // the 10 digits after the country code
  if (/^\+234\d{10}$/.test(compact)) national = compact.slice(4);
  else if (/^234\d{10}$/.test(compact)) national = compact.slice(3);
  else if (/^0\d{10}$/.test(compact)) national = compact.slice(1);
  else if (/^\d{10}$/.test(compact)) national = compact;
  else return null;

  return /^(70|80|81|90|91)\d{8}$/.test(national) ? `+234${national}` : null;
}

/** "+2348031234567" -> "0803 123 4567" (how Nigerians usually write it). */
export function formatNigerianPhone(e164: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

// Validates, then converts to the standard form, so everything after this sees "+234…".
export const phoneSchema = z
  .string('Enter your phone number.')
  .trim()
  .refine((v) => normalizeNigerianPhone(v) !== null, 'Enter a valid Nigerian phone number, e.g. 0803 123 4567.')
  .transform((v) => normalizeNigerianPhone(v) as string);
