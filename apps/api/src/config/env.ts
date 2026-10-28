import { z } from 'zod';

/*
 * Read environment variables ONCE, validate them, and export a typed `env`.
 * If something important is missing the server refuses to start, with a clear message,
 * instead of failing in a confusing way later.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4200),
  WEB_ORIGIN: z.string().default('http://localhost:3300'),
  MONGODB_URI: z.string().default('mongodb://localhost:27019/numvexs'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  COOKIE_SECURE: z.stringbool().default(false),
  // How many proxies sit in front of the API (they add the visitor's IP to X-Forwarded-For). Rate limits need the REAL visitor IP:
  // 1 = one proxy (Nginx on a VPS, or Render alone); 2 = Vercel in front of Render. Too low and everyone shares one IP's limit.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  // Email goes out over SMTP, from the business's own mailbox (e.g. Namecheap Private Email). With no SMTP_HOST (dev), codes are printed instead.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_SECURE: z.stringbool().optional(), // true = SSL from the start (port 465); false = STARTTLS (port 587). Default: true only for 465.
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Number pricing: provider dollar price x rate + markup (same defaults FloZap used: 1500 and 1000).
  USD_NGN_RATE: z.coerce.number().positive().default(1500),
  // JuicySMS quotes euros: 1 EUR in USD, applied before USD_NGN_RATE.
  EUR_USD_RATE: z.coerce.number().positive().default(1.15),
  // Boosting: our price per 1,000 = the panel's dollar rate x USD_NGN_RATE, plus this percentage.
  BOOST_MARKUP_PERCENT: z.coerce.number().min(0).default(30),
  // eSIMs: our price = the provider's dollar price x USD_NGN_RATE, plus this percentage.
  ESIM_MARKUP_PERCENT: z.coerce.number().min(0).default(30),
  // Number rentals: our price = the provider's dollar price x USD_NGN_RATE, plus this percentage.
  RENTAL_MARKUP_PERCENT: z.coerce.number().min(0).default(30),
  // Telegram Premium and Stars: our price = the supplier's dollar price x USD_NGN_RATE, plus this percentage.
  TELEGRAM_MARKUP_PERCENT: z.coerce.number().min(0).default(30),
  GRAMSUBS_SECRET_KEY: z.string().optional(), // the supplier's secret key (sk_live_... / sk_test_...)
  GRAMSUBS_API_KEY: z.string().optional(), // the old name: still read when GRAMSUBS_SECRET_KEY is not set
  // Bank-transfer funding (PocketFi). 'test' uses PocketFi's sandbox (no real money); 'live' is the real thing.
  POCKETFI_MODE: z.enum(['test', 'live']).default('test'),
  POCKETFI_API_TOKEN: z.string().optional(),
  POCKETFI_BUSINESS_ID: z.string().optional(),
  // Signs every webhook PocketFi sends us (HMAC-SHA512 of the raw body). Without it, no deposit is ever credited.
  POCKETFI_WEBHOOK_SECRET: z.string().optional(),
  POCKETFI_BANK: z.enum(['paga', 'kuda', '9psb', 'saveheaven']).default('paga'),
  NUMBER_MARKUP_PERCENT: z.coerce.number().min(0).default(30),
  EMAIL_FROM: z.string().default('NumVex <no-reply@localhost>'), // must be (or be allowed by) the SMTP mailbox, or the mail server rejects it
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:\n', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
