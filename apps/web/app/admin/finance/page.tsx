'use client';

import { useState } from 'react';
import { formatNaira } from '@numvexs/shared';
import { NeedModule } from '@/components/admin/admin-shell';
import { Card, Note, PageHeader, Stat, Table, Tabs, Td, errorOf } from '@/components/admin/ui';
import { useFinance } from '@/lib/admin-hooks';

const LABEL = { numbers: 'Numbers', boost: 'Boost', esim: 'eSIMs', rentals: 'Rentals', telegram: 'Telegram' } as const;
const RANGES = [{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '90', label: '90 days' }, { id: '365', label: 'A year' }];

export default function Page() {
  return (
    <NeedModule module="reports">
      <Finance />
    </NeedModule>
  );
}

function Finance() {
  const [days, setDays] = useState('30');
  const q = useFinance(Number(days));
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Finance" hint="What users paid, what was refunded, and what we kept, per service. 'Kept' is revenue: it is NOT profit, because it does not subtract what the providers charge us." />
      <Tabs value={days} options={RANGES} onChange={setDays} />
      {q.isPending ? <Note>Loading…</Note> : q.isError ? <Note tone="error">{errorOf(q.error)}</Note> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Charged" value={formatNaira(q.data.totals.chargedKobo)} sub="Taken from wallets for orders" />
            <Stat label="Refunded" value={formatNaira(q.data.totals.refundedKobo)} sub="Given back" />
            <Stat label="Kept" value={formatNaira(q.data.totals.netKobo)} sub="Charged minus refunded" tone="ok" />
            <Stat label="Deposited" value={formatNaira(q.data.totals.depositedKobo)} sub="Bank transfers credited" />
          </div>
          <Card title="By service">
            <Table head={['Service', 'Orders', 'Charged', 'Refunded', 'Kept']}>
              {q.data.rows.map((r) => (
                <tr key={r.service}>
                  <Td className="font-semibold">{LABEL[r.service]}</Td>
                  <Td>{r.orders.toLocaleString()}</Td>
                  <Td>{formatNaira(r.chargedKobo)}</Td>
                  <Td className="text-muted">{formatNaira(r.refundedKobo)}</Td>
                  <Td className="font-bold">{formatNaira(r.netKobo)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Money users hold with us right now" hint="The total of every wallet balance: money you owe users, whatever happens.">
            <p className="text-2xl font-extrabold">{formatNaira(q.data.totals.walletFloatKobo)}</p>
          </Card>
        </>
      )}
    </div>
  );
}
