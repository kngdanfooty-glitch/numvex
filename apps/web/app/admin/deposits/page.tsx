'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatNaira } from '@numvexs/shared';
import { NeedModule } from '@/components/admin/admin-shell';
import { Badge, Note, PageHeader, Pager, Table, Tabs, Td, errorOf, when } from '@/components/admin/ui';
import { useAdminDeposits } from '@/lib/admin-hooks';

type Filter = '' | 'credited' | 'unmatched';

export default function Page() {
  return (
    <NeedModule module="wallet">
      <Deposits />
    </NeedModule>
  );
}

function Deposits() {
  const [status, setStatus] = useState<Filter>('');
  const [page, setPage] = useState(1);
  const q = useAdminDeposits({ status: status || undefined, page });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Bank deposits" hint="Every transfer PocketFi has told us about. 'Unmatched' ones were NOT credited because we couldn't tell whose they were: settle them in Needs attention." />
      <Tabs<Filter>
        value={status}
        options={[{ id: '', label: 'All' }, { id: 'credited', label: 'Credited' }, { id: 'unmatched', label: 'Unmatched' }]}
        onChange={(s) => { setStatus(s); setPage(1); }}
      />
      {q.isPending ? <Note>Loading…</Note> : q.isError ? <Note tone="error">{errorOf(q.error)}</Note> : (
        <>
          <Table head={['When', 'Reference', 'User', 'Account', 'Amount', 'Status']} empty="No deposits yet.">
            {q.data.items.map((d) => (
              <tr key={d.id}>
                <Td className="whitespace-nowrap text-muted">{when(d.createdAt)}</Td>
                <Td className="break-all font-mono text-xs">{d.reference}</Td>
                <Td>{d.user ?? <span className="text-muted">—</span>}</Td>
                <Td className="font-mono text-xs text-muted">{d.accountNumber ?? '—'}</Td>
                <Td className="font-semibold">{formatNaira(d.amountKobo)}</Td>
                <Td><Badge>{d.status}</Badge></Td>
              </tr>
            ))}
          </Table>
          <Pager page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={setPage} />
          {status === 'unmatched' || q.data.items.some((d) => d.status === 'unmatched') ? (
            <p className="mt-3 text-xs text-muted"><Link href="/admin/cases" className="font-bold text-accent underline">Settle unmatched deposits →</Link></p>
          ) : null}
        </>
      )}
    </div>
  );
}
