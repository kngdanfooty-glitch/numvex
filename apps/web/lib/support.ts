/** Where people reach NumVex: the support chat and the news channel, both on Telegram. */
export const SUPPORT_URL = 'https://t.me/numvexs';
export const CHANNEL_URL = 'https://t.me/numvexs1';

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
