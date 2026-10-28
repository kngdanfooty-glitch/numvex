import { Icon, type IconName } from '@/components/ui/icons';
import { NAV_TONE, TONES, type ToneName } from '@/components/dashboard/tones';

/* A static picture of the app for the landing page. The browser window is a copy of the real dashboard (same sidebar, balance bar and
 * service cards, same quiet colours); next to it a phone with a code arriving, and a few call-outs. Nothing here is real data. */

const NAV: { group: string; items: { icon: IconName; label: string; href: string; active?: boolean }[] }[] = [
  {
    group: 'Services',
    items: [
      { icon: 'dashboard', label: 'Dashboard', href: '/dashboard', active: true },
      { icon: 'number', label: 'USA Numbers', href: '/dashboard/usa' },
      { icon: 'number', label: 'Buy Numbers', href: '/dashboard/numbers' },
      { icon: 'boost', label: 'Boost', href: '/dashboard/boost' },
      { icon: 'wallet', label: 'Fund Wallet', href: '/dashboard/wallet' },
    ],
  },
  {
    group: 'Account',
    items: [
      { icon: 'history', label: 'History', href: '/dashboard/history' },
      { icon: 'orders', label: 'Orders', href: '/dashboard/orders' },
      { icon: 'profile', label: 'Profile', href: '/dashboard/profile' },
    ],
  },
];

const SERVICES: { icon: IconName; title: string; body: string; tone: ToneName; soon?: boolean }[] = [
  { icon: 'number', title: 'USA numbers', body: 'High success rate', tone: 'blue' },
  { icon: 'number', title: 'Numbers', body: '200+ countries', tone: 'teal' },
  { icon: 'boost', title: 'Boosting', body: 'Followers, likes, views', tone: 'pink' },
  { icon: 'key', title: 'Number rentals', body: 'Keep a number for days', tone: 'indigo', soon: true },
];

const QUICK: { icon: IconName; label: string; tone: ToneName }[] = [
  { icon: 'orders', label: 'My orders', tone: 'sky' },
  { icon: 'history', label: 'History', tone: 'amber' },
  { icon: 'support', label: 'Support', tone: 'rose' },
  { icon: 'profile', label: 'Profile', tone: 'violet' },
];

const ACTIVITY: { icon: IconName; title: string; sub: string; amount: string; tone: ToneName }[] = [
  { icon: 'number', title: 'WhatsApp number', sub: 'United States · code received', amount: '−₦1,450', tone: 'teal' },
  { icon: 'refund', title: 'Refund: unused number', sub: 'Automatic, no code arrived', amount: '+₦700', tone: 'amber' },
  { icon: 'bank', title: 'Bank transfer deposit', sub: 'Credited to your wallet', amount: '+₦25,000', tone: 'green' },
];

function Callout({ icon, title, sub, className }: { icon: IconName; title: string; sub: string; className: string }) {
  return (
    <div className={`absolute z-20 hidden items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-[0_24px_50px_-20px_rgba(37, 99, 235,0.45)] md:flex ${className}`}>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-contrast">
        <Icon name={icon} size={20} />
      </span>
      <div className="text-left">
        <div className="text-sm font-extrabold leading-tight">{title}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
    </div>
  );
}

export function HeroPreview() {
  return (
    <div className="relative mx-auto mt-14 max-w-5xl">
      <div aria-hidden className="pointer-events-none absolute -inset-x-10 -inset-y-10 -z-10 bg-[radial-gradient(44rem_20rem_at_50%_45%,rgba(37, 99, 235,0.2),transparent_70%)]" />

      {/* The browser window */}
      <div className="overflow-hidden rounded-2xl border border-border-strong bg-surface text-left shadow-[0_50px_100px_-40px_rgba(37, 99, 235,0.55)]">
        <div className="flex items-center gap-3 border-b border-border bg-bg-elevated px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          </div>
          <div className="mx-auto flex h-7 w-full max-w-xs items-center justify-center gap-1.5 rounded-md bg-surface font-mono text-[11px] text-faint">
            <Icon name="lock" size={11} /> numvexs.com/dashboard
          </div>
          <div className="w-10" />
        </div>

        <div className="flex">
          {/* Sidebar: the real one, light, with the Wallet card at the bottom */}
          <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-surface p-4 sm:flex">
            <div className="flex items-center gap-2 px-1 pb-5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-contrast">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5.5 19V6l11 12" strokeWidth="2.8" />
                  <circle cx="18.5" cy="5.5" r="1.9" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span className="text-sm font-extrabold">
                Num<span className="text-accent">Vex</span>
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-4">
              {NAV.map((g) => (
                <div key={g.group}>
                  <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{g.group}</div>
                  <ul className="space-y-0.5">
                    {g.items.map((n) => {
                      const t = TONES[NAV_TONE[n.href] ?? 'teal'];
                      return (
                        <li key={n.label} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold ${n.active ? 'bg-accent-soft text-accent' : 'text-muted'}`}>
                          <span className="grid h-6 w-6 place-items-center rounded-md" style={{ backgroundColor: t.soft, color: t.text }}>
                            <Icon name={n.icon} size={13} />
                          </span>
                          {n.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-[#1e40af] p-3 text-white">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/70">Wallet</div>
              <div className="mt-0.5 text-base font-extrabold">₦25,000</div>
              <div className="mt-2 rounded-md bg-white py-1.5 text-center text-[11px] font-bold text-[#1e40af]">+ Fund wallet</div>
            </div>
          </aside>

          {/* Main: header, slim balance bar, service cards, quick links */}
          <div className="min-w-0 flex-1 bg-bg-elevated">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
              <div>
                <div className="text-[15px] font-extrabold leading-tight">Good morning, Ada 👋</div>
                <div className="text-[11px] text-muted">What would you like to do today?</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-2.5 py-1.5 text-xs font-bold sm:inline-flex">
                  <Icon name="wallet" size={13} className="text-accent" /> ₦25,000
                </span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-extrabold text-accent-contrast">A</span>
              </div>
            </div>

            <div className="space-y-4 p-5 xl:pr-28">
              <div className="flex items-center justify-between rounded-xl bg-[#1e40af] px-4 py-3 text-white">
                <div>
                  <div className="text-[10px] font-medium text-white/70">Available balance</div>
                  <div className="text-xl font-bold tracking-tight">₦25,000</div>
                </div>
                <span className="rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-[#1e40af]">+ Fund wallet</span>
              </div>

              <div>
                <div className="mb-2 text-[13px] font-extrabold">What do you need?</div>
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                  {SERVICES.map((sv) => {
                    const t = TONES[sv.tone];
                    return (
                      <div key={sv.title} className={`flex items-center gap-2.5 rounded-xl border p-2.5 ${sv.soon ? 'border-dashed border-border-strong bg-surface/60' : 'border-border bg-surface'}`}>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: t.soft, color: t.text }}>
                          <Icon name={sv.icon} size={17} />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[12.5px] font-bold">{sv.title}</span>
                            {sv.soon ? (
                              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: t.soft, color: t.text }}>
                                Soon
                              </span>
                            ) : null}
                          </span>
                          <span className="hidden truncate text-[10.5px] text-muted sm:block">{sv.body}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {QUICK.map((q) => {
                  const t = TONES[q.tone];
                  return (
                    <div key={q.label} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2">
                      <span className="grid h-6 w-6 place-items-center rounded-md" style={{ backgroundColor: t.soft, color: t.text }}>
                        <Icon name={q.icon} size={13} />
                      </span>
                      <span className="text-[11.5px] font-semibold">{q.label}</span>
                    </div>
                  );
                })}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-extrabold">Recent activity</span>
                  <span className="text-[11px] font-bold text-accent">View all</span>
                </div>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                  {ACTIVITY.map((a) => {
                    const t = TONES[a.tone];
                    return (
                      <li key={a.title} className="flex items-center gap-2.5 px-3 py-2">
                        <span className="grid h-7 w-7 place-items-center rounded-md" style={{ backgroundColor: t.soft, color: t.text }}>
                          <Icon name={a.icon} size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-bold">{a.title}</span>
                          <span className="block truncate text-[10.5px] text-muted">{a.sub}</span>
                        </span>
                        <span className={`text-[12px] font-extrabold ${a.amount.startsWith('+') ? 'text-success' : ''}`}>{a.amount}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The phone */}
      <div className="absolute -bottom-10 -right-24 z-10 hidden w-[200px] rotate-[4deg] rounded-[2rem] border-[6px] border-[#18181b] bg-surface p-3 shadow-[0_40px_70px_-25px_rgba(24, 24, 27,0.55)] xl:block">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[#18181b]" />
        <div className="text-[11px] font-semibold text-muted">WhatsApp · United States</div>
        <div className="mt-1 font-mono text-[13px] font-bold">+1 202 555 0184</div>
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-success">
          <Icon name="check" size={10} /> Code received
        </div>
        <div className="mt-3 flex gap-1">
          {['4', '8', '2', '9', '1', '6'].map((d, i) => (
            <span key={i} className="grid h-8 flex-1 place-items-center rounded-md border border-border-strong bg-bg-elevated font-mono text-sm font-bold text-accent">
              {d}
            </span>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-accent py-2 text-center text-[11px] font-bold text-accent-contrast">Done</div>
      </div>

      {/* Call-outs */}
      <Callout icon="bolt" title="Code in 8 seconds" sub="Automated, 24/7" className="-bottom-14 left-8" />
      <Callout icon="refund" title="+₦700 auto-refund" sub="No code? Money back" className="-bottom-14 left-[38%]" />
      <Callout icon="globe" title="200+ countries" sub="1,000+ platforms" className="-right-6 top-10 lg:right-auto lg:left-[40%] lg:-top-6" />
    </div>
  );
}
