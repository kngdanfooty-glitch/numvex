import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icons';

/** Placeholder for dashboard pages we haven't built yet, so the sidebar never leads to a 404. */
export function ComingSoon({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl pt-10 text-center sm:pt-16">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icon name={icon} size={30} />
      </span>
      <h1 className="section-kicker mt-6 text-3xl font-extrabold sm:text-4xl">{title}</h1>
      <p className="mt-1 text-sm font-semibold text-accent">Coming soon</p>
      <p className="mx-auto mt-3 max-w-md text-muted">{body}</p>
      <Link
        href="/dashboard"
        className="mt-7 inline-flex h-11 items-center rounded-xl border border-border-strong bg-surface px-5 text-sm font-bold hover:bg-surface-2"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
