'use client';

import { capitalize } from '@/lib/name';
import { useState } from 'react';
import { ADMIN_MODULES, ADMIN_ROLES, ROLE_TEMPLATES, type ModuleKey, type TeamMember } from '@numvexs/shared';
import { NeedSuper, useAdmin } from '@/components/admin/admin-shell';
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, Badge, Card, FIELD, Note, PageHeader, errorOf, when } from '@/components/admin/ui';
import { cn } from '@/lib/cn';
import { useAddAdmin, useRevokeAdmin, useTeam, useUpdateAdmin } from '@/lib/admin-hooks';

const ROLE_LABEL: Record<string, string> = { super_admin: 'Super admin', support_agent: 'Support agent', finance_officer: 'Finance officer', custom: 'Custom (pick sections)' };
const moduleLabel = (k: string) => ADMIN_MODULES.find((m) => m.key === k)?.label ?? k;

export default function Page() {
  return (
    <NeedSuper>
      <Team />
    </NeedSuper>
  );
}

function Team() {
  const q = useTeam();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Admin team" hint="Who can open the admin panel, and which sections each person may use. Only super admins can see this page." />
      <Card title="Add an admin" hint="They must already have a NumVex account (verified and active). Support agents see users and orders; finance officers see money, orders and pricing; custom lets you tick the sections.">
        <AddForm />
      </Card>
      <Card title="Current admins">
        {q.isPending ? <Note>Loading…</Note> : q.isError ? <Note tone="error">{errorOf(q.error)}</Note> : (
          <ul className="space-y-3">{q.data.team.map((m) => <Member key={m.id} m={m} />)}</ul>
        )}
      </Card>
    </div>
  );
}

function RolePicker({ role, perms, onRole, onPerms }: { role: string; perms: ModuleKey[]; onRole: (r: string) => void; onPerms: (p: ModuleKey[]) => void }) {
  const shown: ModuleKey[] = role === 'custom' ? perms : role === 'super_admin' ? ADMIN_MODULES.map((m) => m.key) : (ROLE_TEMPLATES[role] ?? []);
  return (
    <div className="space-y-2">
      <select className={FIELD} value={role} onChange={(e) => onRole(e.target.value)} aria-label="Role">
        {ADMIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
      </select>
      <div className="flex flex-wrap gap-2">
        {ADMIN_MODULES.map((m) => {
          const on = shown.includes(m.key);
          return (
            <label key={m.key} className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold', on ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted', role === 'custom' ? 'cursor-pointer' : 'opacity-80')}>
              <input type="checkbox" checked={on} disabled={role !== 'custom'} onChange={(e) => onPerms(e.target.checked ? [...perms, m.key] : perms.filter((k) => k !== m.key))} />
              {m.label}
            </label>
          );
        })}
      </div>
      {role === 'super_admin' ? <p className="text-xs text-danger">A super admin can do everything, including managing this team and moving money.</p> : null}
    </div>
  );
}

function AddForm() {
  const add = useAddAdmin();
  const [user, setUser] = useState('');
  const [role, setRole] = useState('support_agent');
  const [perms, setPerms] = useState<ModuleKey[]>([]);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-3">
      <input className={FIELD} placeholder="Their email or username" value={user} onChange={(e) => { setUser(e.target.value); setConfirming(false); }} />
      <RolePicker role={role} perms={perms} onRole={(r) => { setRole(r); setConfirming(false); }} onPerms={setPerms} />
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Make <b>{user}</b> a <b>{ROLE_LABEL[role] ?? role}</b>?</span>
          <button className={BTN_PRIMARY} disabled={add.isPending} onClick={() => add.mutate({ user, adminRole: role as never, permissions: perms }, { onSettled: () => setConfirming(false), onSuccess: () => setUser('') })}>{add.isPending ? 'Adding…' : 'Confirm'}</button>
          <button className={BTN_GHOST} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      ) : (
        <button className={BTN_PRIMARY} disabled={user.trim().length < 2 || (role === 'custom' && perms.length === 0)} onClick={() => setConfirming(true)}>Add admin</button>
      )}
      {add.isError ? <Note tone="error">{errorOf(add.error)}</Note> : null}
      {add.isSuccess ? <Note tone="ok">Added.</Note> : null}
    </div>
  );
}

function Member({ m }: { m: TeamMember }) {
  const { me } = useAdmin();
  const mine = m.email === me.email;
  const update = useUpdateAdmin(m.id);
  const revoke = useRevokeAdmin(m.id);
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(m.adminRole);
  const [perms, setPerms] = useState<ModuleKey[]>(m.permissions);
  const [removing, setRemoving] = useState(false);
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{capitalize(m.username)} <span className="font-normal text-muted">· {m.email}{mine ? ' (you)' : ''}</span></p>
          <p className="text-xs text-muted">Admin since {when(m.createdAt)}</p>
        </div>
        <Badge>{ROLE_LABEL[m.adminRole] ?? m.adminRole}</Badge>
      </div>
      {!editing ? (
        <p className="mt-2 text-xs text-muted">Can open: {m.isSuperAdmin ? 'everything' : m.permissions.map(moduleLabel).join(', ') || 'nothing'}</p>
      ) : (
        <div className="mt-3">
          <RolePicker role={role} perms={perms} onRole={setRole} onPerms={setPerms} />
          <div className="mt-3 flex gap-2">
            <button className={BTN_PRIMARY} disabled={update.isPending || (role === 'custom' && perms.length === 0)} onClick={() => update.mutate({ adminRole: role as never, permissions: perms }, { onSuccess: () => setEditing(false) })}>{update.isPending ? 'Saving…' : 'Save'}</button>
            <button className={BTN_GHOST} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!mine && !editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={BTN_GHOST} onClick={() => { setRole(m.adminRole); setPerms(m.permissions); setEditing(true); }}>Change role</button>
          {removing ? (
            <>
              <span className="text-sm">Remove admin access for <b>{m.email}</b>?</span>
              <button className={BTN_DANGER} disabled={revoke.isPending} onClick={() => revoke.mutate()}>{revoke.isPending ? 'Removing…' : 'Confirm'}</button>
              <button className={BTN_GHOST} onClick={() => setRemoving(false)}>Cancel</button>
            </>
          ) : (
            <button className={BTN_DANGER} onClick={() => setRemoving(true)}>Remove admin</button>
          )}
        </div>
      ) : null}
      {mine ? <p className="mt-2 text-xs text-muted">You can&apos;t change or remove your own access. Ask another super admin.</p> : null}
      {update.isError ? <div className="mt-2"><Note tone="error">{errorOf(update.error)}</Note></div> : null}
      {revoke.isError ? <div className="mt-2"><Note tone="error">{errorOf(revoke.error)}</Note></div> : null}
    </li>
  );
}
