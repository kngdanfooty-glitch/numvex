'use client';

import { useState } from 'react';
import { MAX_ADJUSTMENT_KOBO, formatNaira } from '@numvexs/shared';
import { NeedModule, useAdmin } from '@/components/admin/admin-shell';
import { BTN_GHOST, BTN_PRIMARY, Card, FIELD, Note, PageHeader, ReasonConfirm, errorOf, when } from '@/components/admin/ui';
import { cn } from '@/lib/cn';
import { useAdjustWallet, useCreditDeposit, useResolveTelegram, useReviewTelegram, useUnmatchedDeposits } from '@/lib/hooks';

/* The few cases that need a person. Every action asks for a reason, then asks again before it is sent, and is written to the audit log. */
export default function Page() {
  return (
    <NeedModule module="wallet">
      <Cases />
    </NeedModule>
  );
}

function Cases() {
  const { can } = useAdmin();
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <PageHeader title="Needs attention" hint="Cases the system could not settle by itself. Every action needs a reason and is recorded in the audit log." />
      {can('wallet') ? <Unmatched /> : null}
      {can('orders') ? <TelegramToCheck canSettle={can('wallet')} /> : null}
      {can('wallet') ? <Adjust /> : null}
    </div>
  );
}

/* ---------------- bank transfers we could not match ---------------- */

function Unmatched() {
  const list = useUnmatchedDeposits();
  return (
    <Card title="Bank transfers we could not match" hint="PocketFi told us money arrived, but not whose it was, so nothing was credited. Find the sender in the PocketFi dashboard, then credit the right user once.">
      {list.isPending ? <Note>Loading…</Note> : list.isError ? <Note tone="error">{errorOf(list.error)}</Note> : list.data.deposits.length === 0 ? <Note>Nothing waiting.</Note> : (
        <ul className="space-y-3">{list.data.deposits.map((d) => <DepositRow key={d.id} d={d} />)}</ul>
      )}
    </Card>
  );
}

function DepositRow({ d }: { d: { id: string; reference: string; amountKobo: number; description: string | null; createdAt: string } }) {
  const credit = useCreditDeposit();
  const [user, setUser] = useState('');
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-extrabold text-accent">{formatNaira(d.amountKobo)}</span>
        <span className="text-xs text-muted">{when(d.createdAt)}</span>
      </div>
      <p className="mt-1 break-all text-xs text-muted">Reference {d.reference}{d.description ? ` · "${d.description}"` : ''}</p>
      <input className={cn(FIELD, 'mb-2 mt-3')} placeholder="Credit to (email or username)" value={user} onChange={(e) => setUser(e.target.value)} />
      <ReasonConfirm
        label="Credit this user"
        describe={<>Credit <b>{formatNaira(d.amountKobo)}</b> to <b>{user}</b>?</>}
        pending={credit.isPending}
        error={credit.isError ? errorOf(credit.error) : null}
        disabled={!user.trim()}
        onConfirm={(reason) => credit.mutate({ id: d.id, user, reason })}
      />
    </li>
  );
}

/* ---------------- Telegram orders we could not confirm ---------------- */

function TelegramToCheck({ canSettle }: { canSettle: boolean }) {
  const list = useReviewTelegram();
  return (
    <Card title="Telegram orders to check" hint="We could not tell whether the supplier took these (the connection dropped). The money is held. Look the order up in the supplier's dashboard: if it was delivered, close it; if not, refund the user.">
      {list.isPending ? <Note>Loading…</Note> : list.isError ? <Note tone="error">{errorOf(list.error)}</Note> : list.data.orders.length === 0 ? <Note>Nothing waiting.</Note> : (
        <ul className="space-y-3">{list.data.orders.map((o) => <TelegramRow key={o.id} o={o} canSettle={canSettle} />)}</ul>
      )}
    </Card>
  );
}

function TelegramRow({ o, canSettle }: { o: { id: string; user: string; service: 'premium' | 'stars'; units: number; recipient: string; costKobo: number; createdAt: string }; canSettle: boolean }) {
  const resolve = useResolveTelegram();
  const [outcome, setOutcome] = useState<'delivered' | 'refund' | null>(null);
  const what = o.service === 'premium' ? `${o.units} months Premium` : `${o.units.toLocaleString()} Stars`;
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{what} → {o.recipient}</span>
        <span className="text-xs text-muted">{when(o.createdAt)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">Paid by {o.user} · {formatNaira(o.costKobo)} held</p>
      {canSettle ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={outcome === 'delivered' ? BTN_PRIMARY : BTN_GHOST} onClick={() => setOutcome('delivered')}>It was delivered</button>
            <button className={outcome === 'refund' ? cn(BTN_PRIMARY, 'bg-danger') : BTN_GHOST} onClick={() => setOutcome('refund')}>It was not: refund the user</button>
          </div>
          {outcome ? (
            <div className="mt-3">
              <ReasonConfirm
                label="Continue"
                describe={outcome === 'refund' ? <>Refund <b>{formatNaira(o.costKobo)}</b> to {o.user}?</> : <>Close this order as delivered (no money moves)?</>}
                pending={resolve.isPending}
                error={resolve.isError ? errorOf(resolve.error) : null}
                onConfirm={(reason) => resolve.mutate({ id: o.id, outcome, reason })}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-muted">A finance admin needs to settle this one (it can refund money).</p>
      )}
    </li>
  );
}

/* ---------------- manual wallet change ---------------- */

function Adjust() {
  const adjust = useAdjustWallet();
  const [user, setUser] = useState('');
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [naira, setNaira] = useState('');
  const kobo = Math.round(Number(naira) * 100);
  const valid = /^\d+(\.\d{1,2})?$/.test(naira.trim()) && kobo > 0 && kobo <= MAX_ADJUSTMENT_KOBO;
  return (
    <Card title="Adjust a wallet" hint={`Add or take money from one user's wallet by hand: a goodwill credit, or taking back a deposit PocketFi reversed. A debit can never take a wallet below zero. One change can move at most ${formatNaira(MAX_ADJUSTMENT_KOBO)}.`}>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <input className={FIELD} placeholder="User (email or username)" value={user} onChange={(e) => setUser(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className={FIELD} value={direction} onChange={(e) => setDirection(e.target.value as 'credit' | 'debit')} aria-label="Add or take">
            <option value="credit">Add money</option>
            <option value="debit">Take money</option>
          </select>
          <input className={FIELD} placeholder="Amount (₦)" inputMode="decimal" value={naira} onChange={(e) => setNaira(e.target.value)} />
        </div>
      </div>
      <ReasonConfirm
        label="Continue"
        danger={direction === 'debit'}
        describe={<>{direction === 'credit' ? 'Add' : 'Take'} <b>{valid ? formatNaira(kobo) : '—'}</b> {direction === 'credit' ? 'to' : 'from'} <b>{user}</b>?</>}
        pending={adjust.isPending}
        error={adjust.isError ? errorOf(adjust.error) : null}
        disabled={!user.trim() || !valid}
        onConfirm={(reason) => adjust.mutate({ user, direction, amountKobo: kobo, reason }, { onSuccess: () => setNaira('') })}
      />
      {!valid && naira.trim() ? <Note tone="error">Enter an amount in naira, like 2500 or 2500.50 (up to {formatNaira(MAX_ADJUSTMENT_KOBO)}).</Note> : null}
      {adjust.isSuccess ? <Note tone="ok">Done. {adjust.data.user} now has {formatNaira(adjust.data.balanceKobo)}.</Note> : null}
    </Card>
  );
}
