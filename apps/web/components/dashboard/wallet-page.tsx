'use client';

import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { formatNaira } from '@numvexs/shared';
import { Icon, type IconName } from '@/components/ui/icons';
import { ApiError } from '@/lib/api';
import { useCreateVirtualAccount, useDeposits, useMe, useVirtualAccount } from '@/lib/hooks';
import { cn } from '@/lib/cn';

type Method = 'bank' | 'crypto';

const METHODS: { id: Method; label: string; icon: IconName }[] = [
  { id: 'bank', label: 'Bank Transfer', icon: 'bank' },
  { id: 'crypto', label: 'Crypto (USDT)', icon: 'bitcoin' },
];

/** White rounded card with a soft blue glow, used for every block on this page. */
function Panel({ children, className, ...rest }: { children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        'rounded-[20px] border border-border bg-surface p-6 shadow-[0_24px_60px_-34px_rgba(37, 99, 235,0.45)]',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/** Small uppercase title with an icon and a thin line under it. */
function PanelTitle({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2.5 border-b border-accent/20 pb-3 text-[13px] font-bold uppercase tracking-[0.02em] text-accent">
      <Icon name={icon} size={18} />
      {children}
    </div>
  );
}

export function WalletPage() {
  const user = useMe().data?.user;
  const [method, setMethod] = useState<Method>('bank');
  if (!user) return null;

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-5">
      {/* Current balance */}
      <Panel className="pb-7">
        <PanelTitle icon="wallet">Current Balance</PanelTitle>
        <div className="py-3 text-center">
          <div className="text-[40px] font-extrabold leading-none text-accent">
            {formatNaira(user.balanceKobo)}
          </div>
          <div className="mt-3 text-[13.5px] text-muted">Available balance</div>
        </div>
      </Panel>

      {/* Method selector */}
      <div role="tablist" aria-label="Funding method" className="grid grid-cols-2 gap-3">
        {METHODS.map((m) => {
          const selected = method === m.id;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setMethod(m.id)}
              className={cn(
                'flex h-[82px] flex-col items-center justify-center gap-2 rounded-2xl border text-[12px] font-bold uppercase tracking-[0.04em] transition-all',
                selected
                  ? 'border-accent bg-accent-soft text-accent shadow-[0_14px_32px_-18px_var(--accent-ring)]'
                  : 'border-border bg-surface text-muted hover:border-border-strong',
              )}
            >
              <Icon name={m.icon} size={22} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Bank transfer */}
      {method === 'bank' ? (
        <BankTransfer />
      ) : (
        <Panel role="tabpanel" aria-label="Crypto">
          <PanelTitle icon="bitcoin">Fund with crypto</PanelTitle>
          <div className="py-3 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
              <Icon name="bitcoin" size={30} />
            </span>
            <h2 className="mt-5 text-[17px] font-extrabold">Crypto Funding Unavailable</h2>
            <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-relaxed text-muted">
              Crypto payments are currently disabled. Please use the{' '}
              <button onClick={() => setMethod('bank')} className="font-bold text-text underline-offset-2 hover:underline">
                Bank Transfer
              </button>{' '}
              option to fund your wallet.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}

/** My static account: the details to pay into, or a short form to make it. */
function BankTransfer() {
  const account = useVirtualAccount();
  const deposits = useDeposits();
  const create = useCreateVirtualAccount();
  const [copied, setCopied] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <>
      <Panel role="tabpanel" aria-label="Bank transfer">
        <PanelTitle icon="bank">Fund with virtual account</PanelTitle>
        {account.isPending ? (
          <p className="text-[15px] text-muted">Loading…</p>
        ) : account.isError ? (
          <p className="text-[15px] text-muted">
            {account.error instanceof ApiError ? account.error.message : 'Could not load your account.'}{' '}
            <button className="font-bold text-accent underline" onClick={() => account.refetch()}>
              Try again
            </button>
          </p>
        ) : account.data.account ? (
          <div>
            <dl className="space-y-3 rounded-xl border border-border bg-surface-2 p-4 text-[15px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Bank</dt>
                <dd className="font-bold">{account.data.account.bankName}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Account number</dt>
                <dd className="flex items-center gap-2 font-bold tracking-wide">
                  {account.data.account.accountNumber}
                  <button type="button" onClick={() => copy(account.data.account!.accountNumber)} className="rounded-md border border-border px-2 py-0.5 text-[11px] font-bold text-accent hover:bg-accent-soft">
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Account name</dt>
                <dd className="text-right font-bold">{account.data.account.accountName}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
              Send money to this account from any bank app. It is added to your wallet automatically, usually within a minute or two. This account is yours alone and stays the same.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-[15px] leading-relaxed text-muted">
              Get your own bank account number for funding your wallet. The account will carry your username, so there is nothing to fill in.
            </p>
            {create.isError ? (
              <p role="alert" className="text-sm text-danger">
                {create.error instanceof ApiError ? create.error.message : 'Could not create your account. Try again.'}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={create.isPending}
              className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#3b82f6] to-[#1e3a8a] text-[14.5px] font-bold text-white shadow-[0_14px_28px_-14px_var(--accent-ring)] transition-[filter] hover:brightness-110 disabled:opacity-60"
            >
              <Icon name="plus" size={17} />
              {create.isPending ? 'Creating…' : 'Create Virtual Account'}
            </button>
          </form>
        )}
      </Panel>

      {account.data?.account && deposits.data && deposits.data.deposits.length > 0 ? (
        <Panel>
          <PanelTitle icon="history">Recent deposits</PanelTitle>
          <ul className="divide-y divide-border">
            {deposits.data.deposits.slice(0, 10).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted">{new Date(d.createdAt).toLocaleString()}</span>
                <span className="font-bold text-success">+{formatNaira(d.amountKobo)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
