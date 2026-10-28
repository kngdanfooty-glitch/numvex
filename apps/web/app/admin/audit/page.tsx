'use client';

import { useState } from 'react';
import { NeedSuper } from '@/components/admin/admin-shell';
import { Badge, FIELD, Note, PageHeader, Pager, Signed, Table, Td, errorOf, when } from '@/components/admin/ui';
import { useAudit } from '@/lib/admin-hooks';

const MODULES = [
  ['', 'Everything'],
  ['wallet', 'Wallet & deposits'],
  ['orders', 'Orders'],
  ['users', 'Users'],
  ['prices', 'Pricing'],
  ['settings', 'Services & settings'],
  ['roles', 'Admin team'],
];

const ACTION: Record<string, string> = {
  credit: 'Added money to a wallet',
  debit: 'Took money from a wallet',
  credit_deposit: 'Credited an unmatched bank deposit',
  user_suspend: 'Suspended a user',
  user_unsuspend: 'Restored a user',
  pricing_update: 'Changed prices',
  services_update: 'Changed service switches',
  admin_add: 'Added an admin',
  admin_update: 'Changed an admin’s role',
  admin_revoke: 'Removed an admin',
};

export default function Page() {
  return (
    <NeedSuper>
      <Audit />
    </NeedSuper>
  );
}

function Audit() {
  const [module, setModule] = useState('');
  const [page, setPage] = useState(1);
  const q = useAudit({ module: module || undefined, page });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Audit log" hint="Everything admins have changed: who, what, when and why. This list only ever grows: nobody can edit or delete an entry from the app." />
      <div className="mb-4 max-w-xs">
        <select className={FIELD} value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }} aria-label="Section">
          {MODULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {q.isPending ? <Note>Loading…</Note> : q.isError ? <Note tone="error">{errorOf(q.error)}</Note> : (
        <>
          <Table head={['When', 'Admin', 'What', 'About', 'Amount', 'Reason']} empty="Nothing recorded yet.">
            {q.data.items.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-muted">{when(e.createdAt)}</Td>
                <Td>{e.admin}</Td>
                <Td>
                  <p className="font-semibold">{ACTION[e.action] ?? e.action}</p>
                  <Badge>{e.module}</Badge>
                  {e.details ? (
                    <details className="mt-1 text-xs text-muted">
                      <summary className="cursor-pointer">Details</summary>
                      <pre className="mt-1 max-w-xs overflow-x-auto whitespace-pre-wrap rounded bg-surface-2 p-2 text-[11px]">{JSON.stringify(e.details, null, 2)}</pre>
                    </details>
                  ) : null}
                </Td>
                <Td className="text-muted">{e.user ?? e.target ?? '—'}</Td>
                <Td>{e.amountKobo != null ? <Signed kobo={e.amountKobo} /> : <span className="text-muted">—</span>}</Td>
                <Td className="max-w-[220px] text-muted">{e.reason ?? '—'}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
