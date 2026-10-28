/*
 * NumVex service worker. Deliberately tiny.
 *
 * What it does: when someone opens or reloads a PAGE with no connection, show a friendly "you're offline" screen instead of the
 * browser's dinosaur.
 *
 * What it does NOT do, on purpose: it never stores pages, API answers, balances or anything private. Every request is sent
 * straight to the network. This is a money app, so a stale screen (an old balance, an old code) is worse than no screen.
 * It also leaves every non-page request (the /api calls, scripts, images) completely alone.
 */

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#2563eb"><title>Offline — NumVex</title>
<style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#fafafa;color:#18181b;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}
  .card{max-width:360px}.logo{width:64px;height:64px;border-radius:16px;background:#2563eb;display:grid;place-items:center;margin:0 auto 20px}
  h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;color:#52525b;line-height:1.5;font-size:15px}
  button{height:44px;padding:0 22px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
</style></head><body><div class="card">
<div class="logo"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 19V6l11 12" stroke-width="2.6"/><circle cx="18.5" cy="5.5" r="1.9" fill="#fff" stroke="none"/></svg></div>
<h1>You're offline</h1>
<p>NumVex needs the internet to show your balance and orders. Check your connection and try again. Nothing was lost: any number you already bought is still safe.</p>
<button onclick="location.reload()">Try again</button>
</div></body></html>`;

// Take over as soon as a new version is installed, so an update never leaves people on an old worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode !== 'navigate') return; // not a page load: let the browser do its normal thing
  event.respondWith(
    fetch(request).catch(
      () => new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }),
    ),
  );
});
