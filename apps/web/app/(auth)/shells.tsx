import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/marketing/logo';
import { Icon, type IconName } from '@/components/ui/icons';

/*
 * Three different page structures for the auth screens:
 *  - SplitShell    (sign in)          the form on plain white at the left, a dark showcase panel at the right
 *  - CenteredShell (sign up)          a tinted page with a top bar and ONE wide card: a teal "what you get" pane + the form
 *  - SimpleShell   (forgot / reset / verify)  a small centred card
 */

const SERVICES: { icon: IconName; title: string; sub: string }[] = [
  { icon: 'number', title: 'Virtual numbers', sub: 'Codes for 1,000+ platforms' },
  { icon: 'boost', title: 'Boosting', sub: 'Followers, likes and views' },
  { icon: 'key', title: 'Number rentals', sub: 'Keep a number for days' },
];

/** Sign in: form left, showcase right. */
export function SplitShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page auth-split">
      <div className="split-form">
        <div className="split-top">
          <Logo />
          <Link href="/" className="split-home">
            ← Back to home
          </Link>
        </div>
        <div className="split-body">
          <div className="split-inner">{children}</div>
        </div>
        <p className="split-foot">© {new Date().getFullYear()} NumVex</p>
      </div>

      <aside className="split-visual" aria-hidden>
        <div className="split-glow" />
        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight xl:text-5xl">
            Everything digital, <span className="text-[#60a5fa]">one tap away.</span>
          </h2>
          <p className="mt-4 text-white/70">Numbers, boosts and rentals on one wallet, with refunds that run themselves.</p>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white/80">WhatsApp · United States</span>
              <span className="rounded-full bg-[#60a5fa]/20 px-2.5 py-1 font-bold text-[#60a5fa]">Code received</span>
            </div>
            <div className="mt-3 font-mono text-lg font-semibold">+1 202 555 0184</div>
            <div className="mt-4 flex gap-2">
              {['4', '8', '2', '9', '1', '6'].map((d, i) => (
                <span key={i} className="grid h-11 flex-1 place-items-center rounded-lg border border-white/15 bg-white/10 font-mono text-lg font-bold text-[#60a5fa]">
                  {d}
                </span>
              ))}
            </div>
          </div>

          <dl className="mt-8 grid grid-cols-3 gap-4 text-center">
            {[
              ['200+', 'Countries'],
              ['<10s', 'Delivery'],
              ['24/7', 'Automated'],
            ].map(([v, l]) => (
              <div key={l}>
                <dd className="text-2xl font-extrabold text-[#60a5fa]">{v}</dd>
                <dt className="font-mono text-[11px] uppercase tracking-wider text-white/60">{l}</dt>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}

/** Sign up: tinted page, top bar, one wide two-pane card. */
export function CenteredShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page auth-centered">
      <header className="ac-top">
        <Logo />
        <p className="text-sm text-muted">
          Already a member?{' '}
          <Link href="/login" className="font-bold text-accent">
            Sign in
          </Link>
        </p>
      </header>
      <main className="ac-main">
        <div className="ac-card">
          <aside className="ac-pane">
            <h2 className="text-3xl font-extrabold leading-tight">One account. Four services.</h2>
            <p className="mt-3 text-sm text-white/75">Free to join. You only pay for what you order.</p>
            <ul className="mt-8 flex flex-col gap-4">
              {SERVICES.map((s) => (
                <li key={s.title} className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <div>
                    <div className="text-sm font-bold">{s.title}</div>
                    <div className="text-xs text-white/70">{s.sub}</div>
                  </div>
                </li>
              ))}
            </ul>
            <ul className="mt-auto flex flex-col gap-2 pt-8 text-sm font-medium">
              {['Instant delivery, 24/7', 'Automatic refunds', 'One wallet for everything'].map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20">
                    <Icon name="check" size={12} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </aside>
          <section className="ac-form">{children}</section>
        </div>
      </main>
    </div>
  );
}

/** Forgot / reset / verify: a small centred card. */
export function SimpleShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page auth-simple">
      <Logo />
      <div className="auth-card">{children}</div>
      <Link href="/" className="mt-6 text-sm font-semibold text-muted hover:text-accent">
        ← Back to home
      </Link>
    </div>
  );
}
