# Running the whole app on Render

Why: Vercel's free Hobby plan blocks deploys of commits written by anyone but the account owner, and Vercel Pro costs about $20 per person.
Render deploys straight from the GitHub repo, so any commit that reaches `main` goes live. Cost with both services always on is about
**$14 a month** (API $7 + website $7).

Nothing in this guide changes the live site until you do step 5 (the domain). Steps 1 to 4 build a second copy you can test first.

## 1. Create the website service

Either:
- **Blueprint:** Render dashboard > New > Blueprint > pick the repo. It reads `render.yaml` and creates only `numvexs-web`. Or
- **By hand:** New > Web Service > the repo, then fill in what `render.yaml` says (build command, start command, plan, region, environment variables).

Pick the **same region as numvexs-api**.

## 2. Set the one variable it asks for

`API_PROXY_TARGET` = the API's public address, for example `https://numvexs-api.onrender.com` (copy it from the API service page, no `/` at the end).
It is read when the site is built, so after changing it press **Manual Deploy > Clear build cache & deploy**.

## 3. Leave TRUST_PROXY alone (for now)

An earlier version of this guide said to change the API's `TRUST_PROXY` to `1`. **Do not.** On Render the visit goes visitor > Render's edge >
website service > Render's edge > API, so the API sees more hops than before, not fewer. Setting it to `1` would make the API think every
visitor is the website service itself, so everyone would share ONE rate-limit budget. Keep it at `2` until the real number has been measured
(log `req.ip` and `req.headers['x-forwarded-for']` for one request from a known IP, then set `TRUST_PROXY` to the number of hops that makes
`req.ip` equal that IP). An alternative that removes a hop: point `API_PROXY_TARGET` at the API's private address.
Leave `WEB_ORIGIN` as it is and keep the other variables as they are.

## 4. Test the copy

Open the `https://numvexs-web.onrender.com` address Render gives you:
- the home and login pages load;
- register a test account (it goes straight to the dashboard);
- the browser tab's Network panel shows `/api/...` calls answering 200 with no CORS errors. If sign-in fails with a cookie or origin error, the
  copy is on a different address than `WEB_ORIGIN`, which is expected: finish testing after step 5 or temporarily add the onrender address to `WEB_ORIGIN`.

## 5. Move the domain (the actual switch)

1. In `numvexs-web` > Settings > Custom Domains add `numvexs.com` and `www.numvexs.com`. Render shows the DNS records.
2. In Namecheap > Advanced DNS replace the Vercel records with the ones Render shows (usually an `A` record for the root and a `CNAME` for `www`).
3. Wait for Render to show the certificate as issued (a few minutes up to an hour).
4. Open https://numvexs.com, register, and buy one cheap number.

**Undo:** put the old Vercel DNS records back (A `@` `216.198.79.1`, CNAME `www` `887d05e035d3e6a7.vercel-dns-017.com.`). Vercel keeps the project until you delete it.

## 6. After the switch

- Stop Vercel deploys: Vercel project > Settings > Git > disconnect, or delete the project once you are happy.
- The deploy hook is no longer needed: revoke it in Settings > Git > Deploy Hooks.
- Every push to `main` now deploys both services by itself.
