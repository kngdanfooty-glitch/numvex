/**
 * Where a visitor came from, taken from the link (`?source=tiktok`, or `utm_source`) and remembered in the browser,
 * so it still counts when they click through to "Create account" on a later page. The first link wins.
 */
const KEY = 'numvexs-source';
const VALID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const clean = (v: string | null | undefined): string | undefined => {
  const slug = v?.trim().toLowerCase();
  return slug && VALID.test(slug) ? slug : undefined;
};

/** Remember a source from the current link, unless one is already remembered. */
export function rememberSource(fromLink: string | null | undefined) {
  const slug = clean(fromLink);
  if (!slug) return;
  try {
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, slug);
  } catch {
    // storage blocked: the sign-up page's own link still works
  }
}

/** The source for a sign-up: the link on this page if it has one, otherwise the one remembered earlier. */
export function getSource(fromLink: string | null | undefined): string | undefined {
  const slug = clean(fromLink);
  if (slug) return slug;
  try {
    return clean(localStorage.getItem(KEY));
  } catch {
    return undefined;
  }
}
