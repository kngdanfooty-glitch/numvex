'use client';

import { capitalize } from '@/lib/name';
import { useState } from 'react';
import Link from 'next/link';
import { formatNaira } from '@numvexs/shared';
import { NeedModule } from '@/components/admin/admin-shell';
import { Badge, FIELD, Note, PageHeader, Pager, Table, Td, errorOf, when } from '@/components/admin/ui';
import { useAdminUsers } from '@/lib/admin-hooks';

export default function Page() {
  return (
    <NeedModule module="users">
      <Users />
    </NeedModule>
  );
}

function Users() {
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useAdminUsers({ search: search || undefined, status: status || undefined, page });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Users" hint="Everyone with an account. Click a name to see what they bought, what they hold, and to suspend them." />
      <form
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(typed.trim());
          setPage(1);
        }}
      >
        <input className={FIELD} placeholder="Search by email, username or phone" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <select className={FIELD} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">All users</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="h-10 rounded-lg bg-accent px-4 text-sm font-bold text-white" type="submit">Search</button>
      </form>

      {q.isPending ? <Note>Loading…</Note> : q.isError ? <Note tone="error">{errorOf(q.error)}</Note> : (
        <>
          <Table head={['User', 'Phone', 'Email', 'Balance', 'Status', 'Joined']} empty="No users match.">
            {q.data.items.map((u) => (
              <tr key={u.id} className="hover:bg-surface-2">
                <Td>
                  <Link href={`/admin/users/${u.id}`} className="font-bold text-accent hover:underline">{capitalize(u.username)}</Link>
                  <p className="text-xs text-muted">{u.email}{u.role === 'admin' ? ' · admin' : ''}</p>
                </Td>
                <Td className="text-muted">{u.phone ?? '—'}</Td>
                <Td><Badge>{u.isVerified ? 'verified' : 'not verified'}</Badge></Td>
                <Td className="font-semibold">{formatNaira(u.balanceKobo)}</Td>
                <Td><Badge>{u.status}</Badge></Td>
                <Td className="text-muted">{when(u.createdAt)}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
