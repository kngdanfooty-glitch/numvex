# Deploying NumVex on one VPS

One server runs everything: the website (port 3000), the API (port 4000), and Nginx in front of both on one domain. The database is MongoDB Atlas. Because the website and the API share one domain, sign-in cookies just work (no subdomain setup).

```
browser ──► Nginx (https, port 443) ──► /api/*  → API  (127.0.0.1:4000)
                                    └─► the rest → Website (127.0.0.1:3000)
API ──► MongoDB Atlas (and the providers: TextVerified, PocketFi, ...)
```

**Never put the .env file, or any key, in git or in a chat.** Create it on the server yourself.

## 0. What you need first
- A VPS: Ubuntu 22.04 or 24.04, at least **2 GB RAM** (Namecheap Pulsar is 2 GB). Note its IP address.
- The domain, and the ability to add DNS records (Namecheap → Domain List → Manage → Advanced DNS).
- A MongoDB Atlas project (free tier is fine to start) with a database user and a connection string.
- A mailbox on the domain for sending sign-up and password-reset codes (Namecheap Private Email works: create e.g. `no-reply@example.com` and note its password). Its SMTP settings are in the mailbox's "Configure email client" page; for Private Email they are usually host `mail.privateemail.com`, port 465 (SSL).
- The provider keys and the PocketFi values, ready to paste into the `.env` (typed by the client or you, not shared in chat).

## 1. Point the domain at the server
In Advanced DNS add two **A records**: host `@` and host `www`, both with the VPS IP address. Wait a few minutes.

## 2. First login and safety (as root, once)
```bash
adduser deploy && usermod -aG sudo deploy          # a normal user to work as
# copy your SSH key to it:  ssh-copy-id deploy@SERVER_IP   (from your computer)
# then, in /etc/ssh/sshd_config set:  PasswordAuthentication no   and   PermitRootLogin no
systemctl restart ssh
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
apt update && apt -y upgrade && apt -y install unattended-upgrades
```
From now on log in as `deploy`.

## 3. Install the tools
```bash
sudo apt -y install nginx git certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt -y install nodejs
sudo npm i -g pm2
node -v    # must be 20 or higher
```

## 4. Get the code onto the server
Copy the project to `/home/deploy/numvexs` (without `node_modules`, `.env` files or `.next`). From your computer:
```bash
rsync -av --exclude node_modules --exclude '.env*' --exclude .next --exclude dist --exclude .git ./ deploy@SERVER_IP:/home/deploy/numvexs/
```
(If you later decide to use a private git repo, `git clone` there instead. Either way, the code reaches the server without anyone else seeing the backend.)

## 5. Create the API's secrets file (on the server)
```bash
cd ~/numvexs/apps/api && nano .env
```
Use `apps/api/.env.example` as the list of names. These must be set for production:
```
NODE_ENV=production
PORT=4000
WEB_ORIGIN=https://example.com            # the real domain, https, no trailing slash
COOKIE_SECURE=true                        # cookies only over https
MONGODB_URI=...                           # Atlas connection string
JWT_ACCESS_SECRET=...                     # a long random value: openssl rand -hex 32
SMTP_HOST=mail.privateemail.com   SMTP_PORT=465
SMTP_USER=no-reply@example.com    SMTP_PASS=...      # the mailbox address and its password
EMAIL_FROM="NumVex <no-reply@example.com>"   # must be that same mailbox
POCKETFI_MODE=live   POCKETFI_API_TOKEN=...   POCKETFI_BUSINESS_ID=...   POCKETFI_WEBHOOK_SECRET=...
(+ the provider keys: TEXTVERIFIED_*, DAISYSMS, SMSPOOL, the boost panels, USD_NGN_RATE ...)
```
Then `chmod 600 .env`. In **Atlas → Network Access**, allow the VPS's IP address, or the API can't reach the database.

> If a second proxy sits in front of the API (for example Vercel proxying to Render), set `TRUST_PROXY=2` in the API's `.env`. Otherwise all visitors share one rate-limit budget.

## 6. Build and start
```bash
cd ~/numvexs
npm ci
npm run build            # builds the API and the website
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup  # run the command it prints, so everything restarts after a reboot
pm2 logs                 # look for "API listening on ..." and no errors
```

## 7. Nginx and HTTPS
```bash
sudo cp deploy/nginx-numvexs.conf /etc/nginx/sites-available/numvexs
sudo nano /etc/nginx/sites-available/numvexs      # replace example.com with the real domain
sudo ln -s /etc/nginx/sites-available/numvexs /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d example.com -d www.example.com     # free HTTPS, renews by itself
```
Check: `https://example.com/health` should answer `{"ok":true}` (that is the API), then open the home page and sign up.

Test the email: sign up with a real address and check the code arrives (look in spam too). If it doesn't, `pm2 logs numvexs-api` shows the mail server's reason (wrong password, wrong port, or a sender the mailbox isn't allowed to use).

## 8. First admin
Sign up normally, verify the email, then make that account an admin directly in the database (there is no sign-up path to admin on purpose). Ask the developer to run the admin script.

## 9. PocketFi
In the PocketFi dashboard set the webhook URL to `https://example.com/api/v1/webhooks/pocketfi`. Test with a small real deposit.

## 10. Updating later
```bash
# copy the new code over (step 4), then on the server:
cd ~/numvexs && npm ci && npm run build && pm2 reload numvexs-api numvexs-web
```

## Keeping it healthy
- **Uptime monitor:** add the home page to a free monitor (UptimeRobot or similar) with email alerts. If the server dies, refunds and deposits stop.
- **Backups:** Atlas free tier has limited backup features, so check what the plan includes; paid tiers include continuous backups.
- **Updates:** `unattended-upgrades` handles security patches. Reboot occasionally; PM2 brings everything back.
- **Logs:** `pm2 logs numvexs-api --lines 100`.
- **Never run two copies of the API** (two servers or PM2 cluster mode): the jobs would run twice.
