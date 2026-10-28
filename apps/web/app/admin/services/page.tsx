'use client';

import { useEffect, useState } from 'react';
import type { ServiceKey, ServiceSettings } from '@numvexs/shared';
import { NeedModule } from '@/components/admin/admin-shell';
import { Card, Note, PageHeader, ReasonConfirm, errorOf } from '@/components/admin/ui';
import { cn } from '@/lib/cn';
import { useSaveServices, useServices } from '@/lib/admin-hooks';

const SERVICES: { key: ServiceKey; label: string; hint: string }[] = [
  { key: 'numbers', label: 'Virtual numbers', hint: 'Buying numbers (USA and all other servers).' },
  { key: 'boost', label: 'Boost', hint: 'Placing boost orders.' },
  { key: 'esim', label: 'eSIMs', hint: 'Buying eSIMs.' },
  { key: 'rentals', label: 'Number rentals', hint: 'Renting numbers and extending rentals.' },
  { key: 'telegram', label: 'Telegram Premium & Stars', hint: 'Buying Premium or Stars.' },
  { key: 'deposits', label: 'New bank account numbers', hint: 'Creating new funding accounts. Money sent to an existing account is always credited.' },
];

export default function Page() {
  return (
    <NeedModule module="settings">
      <Services />
    </NeedModule>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-success' : 'bg-border-strong')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

function Services() {
  const q = useServices();
  const save = useSaveServices();
  const [draft, setDraft] = useState<ServiceSettings | null>(null);
  useEffect(() => {
    if (q.data) setDraft(JSON.parse(JSON.stringify(q.data.settings)) as ServiceSettings);
  }, [q.data]);

  const data = q.data;
  if (!data || !draft) return q.isError ? <Note tone="error">{errorOf(q.error)}</Note> : <Note>Loading…</Note>;
  const servers = data.servers;
  const changed = JSON.stringify(draft) !== JSON.stringify(data.settings);

  const setToggle = (k: ServiceKey, v: boolean) => setDraft({ ...draft, toggles: { ...draft.toggles, [k]: v } });
  const setServer = (key: string, on: boolean) => setDraft({ ...draft, disabledServers: on ? draft.disabledServers.filter((s) => s !== key) : [...draft.disabledServers, key] });
  const off = SERVICES.filter((s) => !draft.toggles[s.key]).map((s) => s.label);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Services" hint="Switch a whole service, or one provider server, on or off. Switching off only stops NEW purchases: orders already placed keep being followed and refunded, and bank deposits are always credited." />

      <Card title="Whole services">
        <ul className="divide-y divide-border">
          {SERVICES.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-bold">{s.label}</p>
                <p className="text-xs text-muted">{s.hint}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn('text-xs font-bold', draft.toggles[s.key] ? 'text-success' : 'text-danger')}>{draft.toggles[s.key] ? 'On' : 'Off'}</span>
                <Toggle on={draft.toggles[s.key]} onChange={(v) => setToggle(s.key, v)} label={s.label} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {(['numbers', 'boost', 'esim', 'rentals'] as const).map((svc) => (
        <Card key={svc} title={`${svc === 'numbers' ? 'Number' : svc === 'boost' ? 'Boost' : svc === 'rentals' ? 'Rental' : 'eSIM'} servers`} hint="Switch off one provider that is down, and users are told to try another server.">
          <ul className="divide-y divide-border">
            {servers[svc].map((s) => {
              const on = !draft.disabledServers.includes(`${svc}:${s.id}`);
              return (
                <li key={s.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-sm font-semibold">{s.label} <span className="font-normal text-muted">({s.id})</span></span>
                  <div className="flex items-center gap-3">
                    <span className={cn('text-xs font-bold', on ? 'text-success' : 'text-danger')}>{on ? 'On' : 'Off'}</span>
                    <Toggle on={on} onChange={(v) => setServer(`${svc}:${s.id}`, v)} label={`${svc} ${s.label}`} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Card title="Save changes">
        {changed ? (
          <ReasonConfirm
            label="Save changes"
            danger={off.length > 0}
            describe={<>Apply these switches to <b>every user</b> now{off.length ? <> (off: {off.join(', ')})</> : null}?</>}
            pending={save.isPending}
            error={save.isError ? errorOf(save.error) : null}
            onConfirm={(reason) => save.mutate({ services: draft, reason })}
          />
        ) : (
          <Note>{save.isSuccess ? 'Saved. The change is live.' : 'No changes yet. Flip a switch above.'}</Note>
        )}
      </Card>
    </div>
  );
}
