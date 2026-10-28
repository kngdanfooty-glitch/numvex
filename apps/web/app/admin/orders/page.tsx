'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatNaira, type OrderKind } from '@numvexs/shared';
import { NeedModule } from '@/components/admin/admin-shell';
import { Badge, FIELD, Note, PageHeader, Pager, Table, Tabs, Td, errorOf, when } from '@/components/admin/ui';
import { useAdminOrders } from '@/lib/admin-hooks';

const KINDS: { id: OrderKind; label: string }[] = [
  { id: 'numbers', label: 'Numbers' },
  { id: 'boost', label: 'Boost' },
  { id: 'esim', label: 'eSIMs' },
  { id: 'rentals', label: 'Rentals' },
  { id: 'telegram', label: 'Telegram' },
];

// The status words each kind of order can have, for the filter.
const STATUSES: Record<OrderKind, string[]> = {
  numbers: ['pending', 'completed', 'cancelled'],
  boost: ['placing', 'pending', 'in_progress', 'completed', 'partial', 'canceled', 'failed'],
  esim: ['placing', 'active', 'failed'],
  rentals: ['placing', 'active', 'expired', 'failed'],
  telegram: ['placing', 'processing', 'delivered', 'failed', 'review'],
};

export default function Page() {
  return (
    <NeedModule module="orders">
      <Suspense fallback={<Note>Loading…</Note>}>
        <Orders />
      </Suspense>
    </NeedModule>
  );
}

function Orders() {
  const params = useSearchParams();
  const startSearch = params.get('search') ?? '';
  const [kind, setKind] = useState<OrderKind>('numbers');
  const [status, setStatus] = useState('');
  const [typed, setTyped] = useState(startSearch);
  const [search, setSearch] = useState(startSearch);
  const [page, setPage] = useState(1);
  const q = useAdminOrders({ kind, status: status || undefined, search: search || undefined, page });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Orders" hint="Every order users have placed, by service. Search by the buyer's email or username." />
      <Tabs value={kind} options={KINDS} onChange={(k) => { setKind(k); setStatus(''); setPage(1); }} />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_auto]" onSubmit={(e) => { e.preventDefault(); setSearch(typed.trim()); setPage(1); }}>
        <input className={FIELD} placeholder="Buyer's email or username" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <select className={FIELD} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">Any status</option>
          {STATUSES[kind].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <button className="h-10 rounded-lg bg-accent px-4 text-sm font-bold text-white" type="submit">Search</button>
      </form>

      {q.isPending ? <Note>Loading…</Note> : q.isError ? <Note tone="error">{errorOf(q.error)}</Note> : (
        <>
          <Table head={['When', 'Buyer', 'Order', 'Status', 'Paid', 'Refunded']} empty="No orders match.">
            {q.data.items.map((o) => (
              <tr key={o.id}>
                <Td className="whitespace-nowrap text-muted">{when(o.createdAt)}</Td>
                <Td>{o.user}</Td>
                <Td>
                  <p className="font-semibold">{o.title}</p>
                  {o.detail ? <p className="text-xs text-muted">{o.detail}</p> : null}
                </Td>
                <Td><Badge>{o.status}</Badge></Td>
                <Td className="font-semibold">{formatNaira(o.costKobo)}</Td>
                <Td className="text-muted">{o.refundedKobo > 0 ? formatNaira(o.refundedKobo) : '—'}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
