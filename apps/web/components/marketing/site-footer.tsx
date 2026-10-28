import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { Logo } from './logo';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Virtual numbers', href: '/#services' },
      { label: 'Boosting', href: '/#services' },
      { label: 'Number rentals', href: '/#services' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Sign in', href: '/login' },
      { label: 'Create account', href: '/register' },
      { label: 'Contact us', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Refund policy', href: '/refunds' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg/80 py-14 backdrop-blur-sm">
      <Container size="wide">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Virtual numbers, boosting and number rentals on one wallet. Instant delivery,
              automatic refunds.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-sm font-bold">{col.title}</div>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm text-muted">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="transition-colors hover:text-accent">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-border pt-6 text-sm text-faint">
          © {new Date().getFullYear()} NumVex. All rights reserved.
        </div>
      </Container>
    </footer>
  );
}
