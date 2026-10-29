'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icons';
import { CHANNEL_URL, EXTERNAL_LINK, SUPPORT_URL } from '@/lib/support';
import { cn } from '@/lib/cn';
import { TelegramMark } from './telegram-mark';

/*
 * The help chat in the corner of every dashboard page. It is a small scripted assistant, not a live agent:
 * it answers the common questions straight away and hands everything else to the team on Telegram.
 * To teach it a new answer, add one entry to TOPICS.
 */

interface Action {
  label: string;
  href: string;
  /** Opens outside NumVex (Telegram). */
  external?: boolean;
}

interface Topic {
  id: string;
  /** The quick-reply button. */
  label: string;
  /** Typed words that lead here. */
  keywords: string[];
  answer: string;
  actions: Action[];
}

const SUPPORT: Action = { label: 'Talk to support', href: SUPPORT_URL, external: true };
const CHANNEL: Action = { label: 'Join our channel', href: CHANNEL_URL, external: true };

const TOPICS: Topic[] = [
  {
    id: 'code',
    label: "My code hasn't arrived",
    keywords: ['code', 'sms', 'otp', 'receive', 'arrive', 'waiting', 'not coming'],
    answer:
      'Wait for the timer on your order to run out. If no code arrives, the number is cancelled and your money goes back to your wallet automatically. You can also cancel it yourself from the Orders page.',
    actions: [{ label: 'Open my orders', href: '/dashboard/orders' }, SUPPORT],
  },
  {
    id: 'wallet',
    label: 'Fund my wallet',
    keywords: ['fund', 'deposit', 'wallet', 'balance', 'top up', 'topup', 'pay', 'transfer', 'bank'],
    answer: 'Open Fund Wallet and send a bank transfer to the account number shown there. The money is added to your wallet automatically once the transfer is confirmed.',
    actions: [{ label: 'Fund wallet', href: '/dashboard/wallet' }, SUPPORT],
  },
  {
    id: 'refund',
    label: 'Refunds',
    keywords: ['refund', 'money back', 'charged', 'deducted', 'failed', 'lost'],
    answer:
      'If a number never gets a code, or a server cannot complete your order, the money returns to your wallet by itself. If something still looks wrong, send our team the order details and they will check it.',
    actions: [{ label: 'See my history', href: '/dashboard/history' }, SUPPORT],
  },
  {
    id: 'order',
    label: 'Find my order',
    keywords: ['order', 'where', 'history', 'receipt', 'find'],
    answer: 'Your orders are on the Orders page, and every payment and refund is listed in History.',
    actions: [{ label: 'Open my orders', href: '/dashboard/orders' }, { label: 'Open history', href: '/dashboard/history' }],
  },
  {
    id: 'news',
    label: 'News and updates',
    keywords: ['news', 'update', 'channel', 'announce', 'telegram channel', 'offers'],
    answer: 'Announcements, new servers and price changes go out on our Telegram channel first.',
    actions: [CHANNEL],
  },
  {
    id: 'human',
    label: 'Talk to a person',
    keywords: ['human', 'agent', 'person', 'support', 'help', 'contact', 'talk', 'speak'],
    answer: 'Our team answers on Telegram. Tell them what happened and include your order details if you have them.',
    actions: [SUPPORT],
  },
];

const FALLBACK = {
  answer: "I'm not sure about that one. Our team can help you directly on Telegram, and the channel has the latest news.",
  actions: [SUPPORT, CHANNEL],
};

const GREETING = "Hi, I'm the NumVex assistant. Pick a topic below or type your question. For anything I can't fix, our team is on Telegram.";

function match(text: string): Topic | null {
  const t = text.toLowerCase();
  let best: { topic: Topic; score: number } | null = null;
  for (const topic of TOPICS) {
    const score = topic.keywords.filter((k) => t.includes(k)).length;
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  return best?.topic ?? null;
}

interface Message {
  id: number;
  from: 'bot' | 'me';
  text: string;
  actions?: Action[];
}

function ActionLink({ a }: { a: Action }) {
  const cls =
    'inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-accent-soft hover:text-accent';
  return a.external ? (
    <a href={a.href} {...EXTERNAL_LINK} className={cls}>
      <TelegramMark size={14} />
      {a.label}
    </a>
  ) : (
    <Link href={a.href} className={cls}>
      {a.label}
    </Link>
  );
}

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ id: 0, from: 'bot', text: GREETING }]);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);

  // Keep the newest message in view, and let Escape close the chat.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function say(me: string, reply: { answer: string; actions: Action[] }) {
    setMessages((m) => [
      ...m,
      { id: nextId.current++, from: 'me', text: me },
      { id: nextId.current++, from: 'bot', text: reply.answer, actions: reply.actions },
    ]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    say(text, match(text) ?? FALLBACK);
  }

  return (
    <>
      {open ? (
        <section
          role="dialog"
          aria-label="NumVex help chat"
          className="fixed bottom-24 right-4 z-30 flex max-h-[min(560px,calc(100vh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] sm:right-6"
        >
          <header className="flex items-center justify-between gap-3 bg-accent px-4 py-3 text-accent-contrast">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20">
                <Icon name="support" size={20} />
              </span>
              <div>
                <div className="text-sm font-extrabold leading-tight">NumVex Help</div>
                <div className="text-xs text-white/80">Instant answers, team on Telegram</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15">
              <Icon name="close" size={18} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className={cn('flex flex-col gap-2', m.from === 'me' ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    m.from === 'me' ? 'rounded-br-md bg-accent text-accent-contrast' : 'rounded-bl-md bg-surface-2 text-text',
                  )}
                >
                  {m.text}
                </div>
                {m.actions ? <div className="flex flex-wrap gap-2">{m.actions.map((a) => <ActionLink key={a.label} a={a} />)}</div> : null}
              </div>
            ))}
            <div ref={bottom} />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
            {TOPICS.map((t) => (
              <button
                key={t.id}
                onClick={() => say(t.label, t)}
                className="rounded-full border border-border-strong px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-accent-soft hover:text-accent"
              >
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-3">
            <label htmlFor="support-chat-input" className="sr-only">
              Type your question
            </label>
            <input
              id="support-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your question"
              maxLength={200}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border-strong bg-bg px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)]"
            />
            <button type="submit" className="h-10 rounded-xl bg-accent px-4 text-sm font-bold text-accent-contrast hover:bg-accent-hover disabled:opacity-50" disabled={!draft.trim()}>
              Send
            </button>
          </form>
        </section>
      ) : null}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close help chat' : 'Open help chat'}
        aria-expanded={open}
        className="fixed bottom-6 right-4 z-30 grid h-[52px] w-[52px] place-items-center rounded-full bg-accent text-accent-contrast shadow-[0_14px_30px_-10px_var(--accent-ring)] transition-transform hover:-translate-y-0.5 sm:right-6"
      >
        <Icon name={open ? 'close' : 'support'} size={24} />
      </button>
    </>
  );
}
