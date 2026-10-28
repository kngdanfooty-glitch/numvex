'use client';

import { useEffect, useState } from 'react';
import { formatNaira, pricingSchema, type PricingSettings } from '@numvexs/shared';
import { NeedModule } from '@/components/admin/admin-shell';
import { Card, FIELD, Note, PageHeader, ReasonConfirm, errorOf } from '@/components/admin/ui';
import { usePricing, useSavePricing } from '@/lib/admin-hooks';

const FIELDS: { key: keyof PricingSettings; label: string; hint: string; unit: string }[] = [
  { key: 'usdNgnRate', label: 'Dollar rate', hint: 'Naira per US dollar. Every provider price is converted with this.', unit: '₦ per $1' },
  { key: 'eurUsdRate', label: 'Euro rate', hint: 'Dollars per euro (JuicySMS quotes in euros).', unit: '$ per €1' },
  { key: 'numberMarkupPercent', label: 'Numbers markup', hint: 'Percent added on top of the provider price.', unit: '%' },
  { key: 'boostMarkupPercent', label: 'Boost markup', hint: 'Percent added on top of the panel price.', unit: '%' },
  { key: 'esimMarkupPercent', label: 'eSIM markup', hint: 'Percent added on top of the provider price.', unit: '%' },
  { key: 'rentalMarkupPercent', label: 'Rentals markup', hint: 'Percent added on top of the provider price for rented numbers.', unit: '%' },
  { key: 'telegramMarkupPercent', label: 'Telegram markup', hint: 'Percent added on top of the supplier price.', unit: '%' },
];

export default function Page() {
  return (
    <NeedModule module="prices">
      <Pricing />
    </NeedModule>
  );
}

function Pricing() {
  const q = usePricing();
  const save = useSavePricing();
  const [form, setForm] = useState<Record<string, string>>({});
  const [bad, setBad] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) setForm(Object.fromEntries(Object.entries(q.data.pricing).map(([k, v]) => [k, String(v)])));
  }, [q.data]);

  const parsed = pricingSchema.safeParse(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])));
  const next = parsed.success ? parsed.data : null;

  // A worked example so the effect of a change is obvious before saving: what a boost the panel sells for $1.00 per 1,000 would cost a user.
  const example = (p: PricingSettings) => Math.round(1 * p.usdNgnRate * (1 + p.boostMarkupPercent / 100) * 100);

  if (q.isPending) return <Note>Loading…</Note>;
  if (q.isError) return <Note tone="error">{errorOf(q.error)}</Note>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Pricing" hint="The rates and markups used to price every order. A saved change applies to the very next order: nothing needs restarting." />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-sm font-bold">{f.label}</span>
              <span className="ml-2 text-xs text-muted">{f.unit}</span>
              <input className={`${FIELD} mt-1`} inputMode="decimal" value={form[f.key] ?? ''} onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setBad(null); save.reset(); }} />
              <span className="mt-1 block text-xs text-muted">{f.hint}</span>
            </label>
          ))}
        </div>
        {next ? (
          <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm">
            Example: a boost the panel sells for <b>$1.00</b> per 1,000 would cost a user <b>{formatNaira(example(next))}</b>
            {q.data.pricing && example(q.data.pricing) !== example(next) ? <> (now {formatNaira(example(q.data.pricing))})</> : null}.
          </p>
        ) : (
          <p className="mt-4 text-sm text-danger">Every field needs a number above zero (markups can be 0).</p>
        )}
      </Card>
      <Card title="Save these prices">
        <ReasonConfirm
          label="Save prices"
          describe={<>Change the prices for <b>every new order</b>?</>}
          pending={save.isPending}
          disabled={!next}
          error={bad ?? (save.isError ? errorOf(save.error) : null)}
          onConfirm={(reason) => (next ? save.mutate({ pricing: next, reason }) : setBad('Check the numbers first.'))}
        />
        {save.isSuccess ? <Note tone="ok">Saved. New orders use these prices now.</Note> : null}
      </Card>
    </div>
  );
}
