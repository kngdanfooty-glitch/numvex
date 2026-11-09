/*
 * Names and addresses nobody may sign up with: our own brand, staff-sounding names and our own email domains. They exist to stop
 * impersonation ("support", "admin@megahub.ng") and are checked ONLY when an account is created (register), never at login.
 */

/** Our brand names. Anything that contains one is ours: usernames, email domains. */
const BRAND = ['megahub', 'numvex', 'mhub'];

/** Words that make a name sound like staff or an official account. */
const AUTHORITY = [
  'admin', 'administrator', 'superadmin', 'root', 'sysadmin', 'moderator', 'mod', 'staff', 'team', 'support', 'help', 'helpdesk', 'service',
  'official', 'security', 'billing', 'finance', 'payment', 'payments', 'sales', 'ceo', 'owner', 'founder', 'manager', 'system', 'noreply',
  'info', 'contact', 'hello', 'abuse', 'postmaster', 'webmaster', 'verify', 'verification', 'wallet', 'refund', 'refunds', 'api', 'null',
  'undefined',
];

/** Lowercase, undo look-alike characters (adm1n, @dmin, supp0rt), and drop separators, so "Ad_min.01" and "admin" compare equal. */
function squash(s: string): string {
  return s
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[^a-z]/g, ''); // separators and leftover digits
}

const hasBrand = (s: string) => BRAND.some((b) => s.includes(b));
// Short words (info, help, team...) only count when the whole name IS the word, so "Steam" or "Helen" are fine; longer ones count anywhere in it.
const hasAuthority = (s: string) => AUTHORITY.some((w) => s === w || (w.length >= 5 && s.includes(w)));

/** A username that is a staff-sounding word, or contains our brand name. */
export function isReservedUsername(username: string): boolean {
  const s = squash(username);
  return hasBrand(s) || hasAuthority(s);
}

/**
 * An email that would pass for ours: any address at one of our domains (megahub.ng, megahub.com...), or a look-alike such as
 * megahubadmin@gmail.com (our brand AND a staff word in the name part).
 */
export function isBrandEmail(email: string): boolean {
  const [local = '', domain = ''] = email.toLowerCase().trim().split('@');
  if (hasBrand(squash(domain))) return true;
  const name = squash(local);
  return hasBrand(name) && hasAuthority(name);
}
