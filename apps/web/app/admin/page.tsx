'use client';

import Link from 'next/link';
import { formatNaira } from '@numvexs/shared';
import { NeedModule } from '@/components/admin/admin-shell';
import { BarChart, Card, Note, PageHeader, Signed, Stat, Table, Td, errorOf, when } from '@/components/admin/ui';
import { useDashboard } from '@/lib/admin-hooks';

const SERVICES = [
  ['numbers', 'Numbers'],
  ['boost', 'Boost'],
] as const;

export default function Page() {
  return (
    <NeedModule module="dashboard">
      <Dashboard />
    </NeedModule>
  );
}

function Dashboard() {
  const q = useDashboard();
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Dashboard" hint="How the business is doing right now. Refreshes every minute." />
      {q.isPending ? <Note>Loading…</Note> : q.isError ? <Note tone="error">{errorOf(q.error)}</Note> : <Body d={q.data} />}
    </div>
  );
}

function Body({ d }: { d: NonNullable<ReturnType<typeof useDashboard>['data']> }) {
  const need = d.needsAttention;
  const attention = need.unmatchedDeposits + need.stuckNumbers;
  return (
    <>
      {attention > 0 ? (
        <Link href="/admin/cases" className="block rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm hover:bg-danger/10">
          <b className="text-danger">{attention} thing{attention === 1 ? '' : 's'} need{attention === 1 ? 's' : ''} a person:</b>{' '}
          {[need.unmatchedDeposits && `${need.unmatchedDeposits} bank transfer${need.unmatchedDeposits === 1 ? '' : 's'} we couldn't match`, need.stuckNumbers && `${need.stuckNumbers} number${need.stuckNumbers === 1 ? '' : 's'} stuck waiting past expiry`].filter(Boolean).join(' · ')}
          . Open them →
        </Link>
      ) : (
        <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-sm text-success">Nothing needs attention right now.</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={d.totals.users.toLocaleString()} sub={`+${d.totals.newUsers30d.toLocaleString()} in the last 30 days`} />
        {d.totals.walletFloatKobo !== null && <Stat label="Wallet float" value={formatNaira(d.totals.walletFloatKobo)} sub="Money users hold with us" />}
        {d.totals.depositsTodayKobo !== null && <Stat label="Deposits today" value={formatNaira(d.totals.depositsTodayKobo)} sub="Bank transfers credited" />}
        {d.totals.depositsMonthKobo !== null && <Stat label="Deposits, 30 days" value={formatNaira(d.totals.depositsMonthKobo)} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SERVICES.map(([k, label]) => (
          <Stat key={k} label={`${label} orders`} value={d.orders[k].today.toLocaleString()} sub={`today · ${d.orders[k].month.toLocaleString()} in 30 days`} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {d.revenueTrend && (
          <Card title="Money kept, per day" hint="What users paid minus what was refunded, across all services.">
            <BarChart points={d.revenueTrend} format={(v) => formatNaira(v)} />
          </Card>
        )}
        <Card title="New users, per day">
          <BarChart points={d.userGrowth} format={(v) => String(v)} color="var(--success)" />
        </Card>
      </div>

      <Card title="Latest orders" right={<Link href="/admin/orders" className="text-xs font-bold text-accent underline">All orders</Link>}>
        <Table head={d.recent.some((r) => r.amountKobo !== null) ? ['When', 'User', 'Order', 'Amount'] : ['When', 'User', 'Order']} empty="No orders yet.">
          {d.recent.map((r) => (
            <tr key={r.id}>
              <Td className="text-muted">{when(r.createdAt)}</Td>
              <Td>{r.user}</Td>
              <Td className="font-semibold">{r.title}</Td>
              {r.amountKobo !== null && <Td><Signed kobo={r.amountKobo} /></Td>}
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
