import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icons';
import { HeroPreview } from '@/components/marketing/hero-preview';
import { HERO_STATS, HOW_IT_WORKS, PERKS, PLATFORMS, SERVICES, WHY } from '@/components/marketing/content';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function LandingPage() {
  return (
    <>
      {/* Hero: light, centred, with a picture of the dashboard rising out of it */}
      <div className="relative overflow-hidden bg-[radial-gradient(60rem_26rem_at_50%_-6rem,rgba(37, 99, 235,0.16),transparent_70%)]">
        <Container size="wide" className="pb-20 pt-16 text-center sm:pt-24">
          <div className="mx-auto inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-accent/20 bg-accent-soft px-4 py-1.5 text-xs font-semibold text-accent">
            <span>Numbers</span>
            <span className="opacity-40">•</span>
            <span>Boosting</span>
            <span className="opacity-40">•</span>
            <span>Rentals</span>
          </div>
          <h1 className="mx-auto mt-6 max-w-4xl text-[2.7rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
            Everything digital, <span className="text-accent">one hub.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            Virtual numbers, account boosting and number rentals on a single wallet. Order in a click, get it in seconds, and
            let automatic refunds keep everything square.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/register" size="lg">
              Create free account <Icon name="arrow" size={18} />
            </Button>
            <Button href="#services" variant="outline" size="lg">
              See what you can do
            </Button>
          </div>

          <HeroPreview />
        </Container>
      </div>

      {/* Platforms */}
      <Container size="wide" className="py-14 text-center">
        <p className="text-sm font-semibold text-faint">Trusted for the platforms you already use</p>
        <div className="mx-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-2.5">
          {PLATFORMS.map((p) => (
            <span key={p} className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-muted">
              {p}
            </span>
          ))}
        </div>
      </Container>

      {/* Services: a bento grid */}
      <Section id="services" className="pt-4">
        <Container size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold sm:text-5xl">
              Three services. <span className="text-accent">One wallet.</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted">Priced in naira and delivered the moment you order.</p>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {/* Numbers: the big one */}
            <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#2563eb,#1e3a8a)] p-8 text-white shadow-[0_30px_60px_-30px_rgba(37, 99, 235,0.7)] lg:col-span-2 lg:p-10">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
                <Icon name={SERVICES.numbers.icon} size={24} />
              </span>
              <h3 className="mt-6 text-3xl font-extrabold">{SERVICES.numbers.title}</h3>
              <p className="mt-3 max-w-lg text-white/80">{SERVICES.numbers.body}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {SERVICES.numbers.chips.map((c) => (
                  <span key={c} className="rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-medium">
                    {c}
                  </span>
                ))}
              </div>
              <Link href="/register" className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold">
                Get a number <Icon name="arrow" size={16} />
              </Link>
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            </div>

            {/* Boosting */}
            <Card className="p-8 transition-all hover:-translate-y-1 hover:border-accent/40">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                <Icon name={SERVICES.boosting.icon} size={24} />
              </span>
              <h3 className="mt-6 text-2xl font-extrabold">{SERVICES.boosting.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{SERVICES.boosting.body}</p>
              <Link href="/register" className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-accent">
                Start boosting <Icon name="arrow" size={16} />
              </Link>
            </Card>

            {/* Rentals */}
            <div className="rounded-3xl border border-accent/20 bg-accent-soft/70 p-8 transition-all hover:-translate-y-1 hover:border-accent/40 lg:col-span-3 lg:p-10">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-contrast">
                <Icon name={SERVICES.rentals.icon} size={24} />
              </span>
              <h3 className="mt-6 text-3xl font-extrabold">{SERVICES.rentals.title}</h3>
              <p className="mt-3 max-w-lg text-muted">{SERVICES.rentals.body}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {SERVICES.rentals.chips.map((c) => (
                  <span key={c} className="rounded-full border border-accent/25 bg-surface px-3.5 py-1.5 text-sm font-semibold text-accent">
                    {c}
                  </span>
                ))}
              </div>
              <Link href="/register" className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-accent">
                Rent a number <Icon name="arrow" size={16} />
              </Link>
            </div>
          </div>
        </Container>
      </Section>

      {/* The one dark section: how it works + the numbers */}
      <section id="how-it-works" className="relative scroll-mt-20 overflow-hidden bg-[#09090b] py-20 text-white sm:py-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_22rem_at_15%_0%,rgba(37, 99, 235,0.35),transparent_70%),radial-gradient(34rem_20rem_at_100%_100%,rgba(96, 165, 250,0.2),transparent_70%)]" />
        <Container size="wide" className="relative">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold sm:text-5xl">
              From wallet to delivered in <span className="text-[#60a5fa]">three steps.</span>
            </h2>
            <p className="mt-4 text-white/70">A clean, predictable path with nothing to chase.</p>
          </div>

          <ol className="mt-14 grid gap-5 md:grid-cols-3">
            {HOW_IT_WORKS.map((s) => (
              <li key={s.step} className="rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-sm">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-accent font-mono text-sm font-bold">{s.step}</span>
                <h3 className="mt-5 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{s.body}</p>
              </li>
            ))}
          </ol>

          <dl className="mt-14 grid grid-cols-2 gap-6 border-t border-white/10 pt-10 text-center lg:grid-cols-4">
            {HERO_STATS.map((s) => (
              <div key={s.label}>
                <dd className="text-4xl font-extrabold text-[#60a5fa] sm:text-5xl">{s.value}</dd>
                <dt className="mt-1 font-mono text-xs uppercase tracking-wider text-white/60">{s.label}</dt>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* Why: heading on the left, reasons on the right */}
      <Section id="why">
        <Container size="wide" className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <div>
            <h2 className="text-3xl font-extrabold sm:text-5xl">
              Built to be <span className="text-accent">trusted.</span>
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
              You should never wonder where your money went. Every order is tracked, and anything that fails is returned to your wallet.
            </p>
            <Button href="/register" size="lg" className="mt-8">
              Create free account
            </Button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {WHY.map((w) => (
              <Card key={w.title} className="p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon name={w.icon} size={22} />
                </span>
                <h3 className="mt-4 text-base font-bold">{w.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{w.body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* Closing call to action: light, with a violet glow */}
      <Section className="pt-0">
        <Container size="wide">
          <div className="rounded-3xl border border-accent/20 bg-[radial-gradient(50rem_20rem_at_50%_0%,rgba(37, 99, 235,0.14),transparent_70%)] bg-accent-soft/50 px-6 py-14 text-center sm:px-14 sm:py-16">
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold sm:text-5xl">
              Open your <span className="text-accent">NumVex</span> today.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">No subscription, no hidden fees. You only pay for what you order.</p>
            <ul className="mt-6 flex flex-wrap justify-center gap-2.5">
              {PERKS.map((p) => (
                <li key={p} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium">
                  <Icon name="check" size={14} className="text-accent" />
                  {p}
                </li>
              ))}
            </ul>
            <Button href="/register" size="lg" className="mt-8">
              Create your free account <Icon name="arrow" size={18} />
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
