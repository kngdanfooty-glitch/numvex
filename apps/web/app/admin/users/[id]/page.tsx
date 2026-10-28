'use client';

import { capitalize } from '@/lib/name';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatNaira } from '@numvexs/shared';
import { NeedModule, useAdmin } from '@/components/admin/admin-shell';
import { Badge, Card, Note, PageHeader, ReasonConfirm, Stat, errorOf, when } from '@/components/admin/ui';
import { useAdminUser, useSuspend } from '@/lib/admin-hooks';

export default function Page() {
  return (
    <NeedModule module="users">
      <UserPage />
    </NeedModule>
  );
}

function UserPage() {
  const { id } = useParams<{ id: string }>();
  const q = useAdminUser(id);
  const suspend = useSuspend(id);
  const { can } = useAdmin();

  if (q.isPending) return <Note>Loading…</Note>;
  if (q.isError) return <Note tone="error">{errorOf(q.error, 'Could not load this user.')}</Note>;
  const u = q.data.user;
  const suspended = u.status === 'suspended';

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/admin/users" className="text-xs font-bold text-accent hover:underline">← All users</Link>
      <PageHeader title={capitalize(u.username)} hint={`${u.email}${u.phone ? ` · ${u.phone}` : ''}`} right={<Badge>{u.status}</Badge>} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Wallet balance" value={formatNaira(u.balanceKobo)} />
        <Stat label="Deposited" value={formatNaira(u.depositedKobo)} sub="Bank transfers credited, ever" />
        <Stat label="Spent" value={formatNaira(u.spentKobo)} sub="After refunds" />
      </div>

      <Card title="About this account">
        <dl className="grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
          <Row k="Joined" v={when(u.createdAt)} />
          <Row k="Email verified" v={u.isVerified ? 'Yes' : 'No'} />
          <Row k="Role" v={u.role} />
          <Row k="Bank account for funding" v={u.account ? `${u.account.bankName} · ${u.account.accountNumber}` : 'None yet'} />
        </dl>
      </Card>

      <Card title="What they have ordered" right={<Link href={`/admin/orders?search=${encodeURIComponent(u.username)}`} className="text-xs font-bold text-accent underline">See their orders</Link>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="Numbers" value={u.counts.numbers} />
          <Stat label="Boost" value={u.counts.boost} />
        </div>
      </Card>

      {u.role === 'admin' ? (
        <Card title="This user is an admin"><Note>Remove their admin access in Admin team before you suspend them.</Note></Card>
      ) : (
        <Card
          title={suspended ? 'Restore this account' : 'Suspend this account'}
          hint={suspended ? 'They will be able to sign in again.' : 'They can no longer sign in, and any session they have open is cut straight away. Their money stays in their wallet.'}
        >
          <ReasonConfirm
            label={suspended ? 'Restore account' : 'Suspend account'}
            danger={!suspended}
            describe={suspended ? <>Restore <b>{u.email}</b>?</> : <>Suspend <b>{u.email}</b>?</>}
            pending={suspend.isPending}
            error={suspend.isError ? errorOf(suspend.error) : null}
            onConfirm={(reason) => suspend.mutate({ suspend: !suspended, reason })}
          />
        </Card>
      )}

      {can('wallet') ? (
        <Card title="Change their wallet by hand">
          <Note>
            Use <Link href="/admin/cases" className="font-bold text-accent underline">Needs attention</Link> to add or take money. It asks for a reason and is recorded.
          </Note>
        </Card>
      ) : null}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-3 border-b border-border pb-2">
    <dt className="text-muted">{k}</dt>
    <dd className="text-right font-semibold">{v}</dd>
  </div>
);
