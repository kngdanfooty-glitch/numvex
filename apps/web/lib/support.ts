/**
 * Where people reach NumVex: the support chat and the news channel, both on Telegram.
 * Set NEXT_PUBLIC_SUPPORT_URL and NEXT_PUBLIC_CHANNEL_URL to change them without touching the code. Next.js bakes these in when
 * the site is BUILT, so after changing one on Render the website must be redeployed (Manual Deploy, "Clear build cache & deploy").
 * The names must be written out in full like this, or Next.js cannot find them. An empty value falls back to the default.
 */
export const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL?.trim() || 'https://t.me/numvexs';
export const CHANNEL_URL = process.env.NEXT_PUBLIC_CHANNEL_URL?.trim() || 'https://t.me/numvexs0';

/** Spread onto an <a> so the link opens in a new tab without handing the new page a reference to ours. */
export const EXTERNAL_LINK = { target: '_blank', rel: 'noopener noreferrer' } as const;

// The login popup shows once per sign-in. This flag is what remembers "already shown", and signing in or out clears it.
const WELCOME_KEY = 'numvexs-welcome-seen';

export function welcomeAlreadyShown(): boolean {
  try {
    return sessionStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWelcomeShown() {
  try {
    sessionStorage.setItem(WELCOME_KEY, '1');
  } catch {}
}

/** Call on every sign-in and sign-out, so the next sign-in sees the popup again. */
export function resetWelcomePopup() {
  try {
    sessionStorage.removeItem(WELCOME_KEY);
  } catch {}
}
