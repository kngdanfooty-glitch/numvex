import type { Metadata } from 'next';
import { Icon } from '@/components/ui/icons';
import { TelegramMark } from '@/components/dashboard/telegram-mark';
import { CHANNEL_URL, EXTERNAL_LINK, SUPPORT_URL } from '@/lib/support';

export const metadata: Metadata = { title: 'Support' };

const OPTIONS = [
  {
    title: 'Talk to support',
    body: 'Message our team about an order, a payment or your account. Include your order details so they can check it faster.',
    cta: 'Open support chat',
    href: SUPPORT_URL,
  },
  {
    title: 'Join our channel',
    body: 'New servers, price changes and announcements go out here first.',
    cta: 'Open the channel',
    href: CHANNEL_URL,
  },
];

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl pt-6 sm:pt-10">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Icon name="support" size={28} />
      </span>
      <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl">Support</h1>
      <p className="mt-2 max-w-xl text-muted">We answer on Telegram. For quick answers, use the help chat in the corner of any dashboard page.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <div key={o.title} className="flex flex-col rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-lg font-bold">{o.title}</h2>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{o.body}</p>
            <a
              href={o.href}
              {...EXTERNAL_LINK}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-accent-contrast transition-colors hover:bg-accent-hover"
            >
              <TelegramMark size={18} /> {o.cta}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
