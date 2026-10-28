'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { BOOST_SERVERS, formatNaira, type BoostServerId } from '@numvexs/shared';
import { Icon, type IconName } from '@/components/ui/icons';
import { ApiError } from '@/lib/api';
import { useBoostCatalog, useMe, usePlaceBoostOrder } from '@/lib/hooks';
import { validate } from '@/lib/validation';
import { cn } from '@/lib/cn';
import { PlatformIcon } from './platform-icon';

const fieldBox =
  'h-[46px] w-full rounded-lg border px-4 text-[14.5px] outline-none transition-colors';

function Label({ children }: { children: string }) {
  return <div className="mb-2 text-[13.5px] font-bold">{children}</div>;
}

function Hint({ icon, children }: { icon: IconName; children: string }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-faint">
      <Icon name={icon} size={13} />
      {children}
    </p>
  );
}

export function SmmOrderPage() {
  const params = useSearchParams();
  const serviceId = params.get('service') ?? '';
  const server: BoostServerId = BOOST_SERVERS.find((s) => s.id === params.get('server'))?.id ?? BOOST_SERVERS[0].id;
  const user = useMe().data?.user;
  const catalog = useBoostCatalog(server); // already cached when the user came from the services page
  const [link, setLink] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // One id per order form. The same id twice is the same order, so a double-click can't charge twice; a refused order gets a fresh one.
  const [requestId, setRequestId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`));
  const place = usePlaceBoostOrder(server);

  // undefined = still loading, null = not found on this server
  const found = useMemo(() => {
    if (catalog.isPending) return undefined;
    for (const platform of catalog.data?.platforms ?? []) {
      for (const category of platform.categories) {
        const service = category.services.find((s) => s.id === serviceId);
        if (service) return { service, category, platform };
      }
    }
    return null;
  }, [catalog.isPending, catalog.data, serviceId]);

  if (found === undefined || !user) {
    return (
      <div className="grid place-items-center py-24" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
      </div>
    );
  }

  if (found === null) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-extrabold">Service not found</h1>
        <p className="mt-2 text-sm text-muted">That service doesn&apos;t exist or is no longer available.</p>
        <Link
          href="/dashboard/boost"
          className="mt-6 inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-bold text-accent-contrast"
        >
          Browse services
        </Link>
      </div>
    );
  }

  const { service, category, platform } = found;
  const qty = Number.parseInt(quantity, 10);
  const hasQty = Number.isFinite(qty) && qty > 0;

  // Rules for this particular service (its min/max come from the catalogue).
  const orderSchema = z.object({
    link: z.url('Enter a valid link, starting with https://').max(500),
    quantity: z.coerce
      .number('Enter a quantity.')
      .int('Quantity must be a whole number.')
      .min(service.min, `Minimum quantity is ${service.min.toLocaleString('en-US')}.`)
      .max(service.max, `Maximum quantity is ${service.max.toLocaleString('en-US')}.`),
  });
  const { data, errors } = validate(orderSchema, { link: link.trim(), quantity });

  // Whole kobo only: quantity x (price per 1k) / 1000, rounded.
  const total = hasQty ? Math.round((qty * service.ratePer1kKobo) / 1000) : 0;
  const enough = user.balanceKobo >= total;

  const buttonLabel = !hasQty
    ? 'Enter Quantity First'
    : !data
      ? 'Check Your Details'
      : !enough
        ? 'Insufficient Balance'
        : 'Place Order';
  const canPlace = Boolean(data) && enough;

  return (
    <div className="mx-auto w-full max-w-[700px]">
      {/* Header card */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-6 py-[22px] shadow-[0_20px_50px_-36px_rgba(37, 99, 235,0.5)]">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#1e3a8a] text-white shadow-[0_10px_20px_-8px_var(--accent-ring)]">
            <Icon name="cart" size={24} />
          </span>
          <div>
            <h1 className="text-[22px] font-extrabold leading-tight">
              Place <span className="text-accent">Order</span>
            </h1>
            <p className="text-[13.5px] text-faint">Complete your SMM order securely</p>
          </div>
        </div>
        <Link
          href="/dashboard/boost"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] bg-[#18181b] px-4 text-[12.5px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#18181b]"
        >
          <Icon name="back" size={15} />
          Back
        </Link>
      </div>

      {/* Form card */}
      <section className="mt-[30px] overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_60px_-36px_rgba(37, 99, 235,0.5)]">
        <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#3b82f6] to-[#1e3a8a] px-6 py-[18px] text-white">
          <div className="flex items-center gap-3 text-[16px] font-bold">
            <Icon name="boost" size={20} />
            Order Details
          </div>
          <Link
            href="/dashboard/boost"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white/15 px-4 text-[13px] font-semibold transition-colors hover:bg-white/25"
          >
            <Icon name="back" size={14} />
            Change Service
          </Link>
        </header>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (!canPlace || place.isPending || place.isSuccess || !data) return;
            place.mutate(
              { service: service.id, link: data.link, quantity: data.quantity, requestId },
              { onError: () => setRequestId(crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`) },
            );
          }}
          className="flex flex-col gap-5 p-6"
        >
          <div>
            <Label>Selected Service</Label>
            <div className="flex min-h-[46px] items-center gap-2.5 rounded-lg border border-border-strong bg-surface-2 px-4 py-2.5 text-[14.5px] text-muted">
              <PlatformIcon id={platform.id} size={18} className="shrink-0 text-accent" />
              {service.name}
            </div>
            <Hint icon="tag">{category.name}</Hint>
          </div>

          <div>
            <Label>Target Link</Label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={`e.g., https://www.${platform.id}.com/p/yourpost/`}
              inputMode="url"
              autoComplete="off"
              aria-invalid={submitted && Boolean(errors?.link)}
              className={cn(
                fieldBox,
                'bg-accent-soft/50 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]',
                submitted && errors?.link ? 'border-danger' : 'border-accent/25',
              )}
            />
            {submitted && errors?.link ? (
              <p className="mt-2 text-[12px] text-danger">{errors.link}</p>
            ) : (
              <Hint icon="info">Ensure your profile/post is public.</Hint>
            )}
          </div>

          <div>
            <Label>Quantity</Label>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
              placeholder={`Min: ${service.min.toLocaleString('en-US')} | Max: ${service.max.toLocaleString('en-US')}`}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={hasQty && Boolean(errors?.quantity)}
              className={cn(
                fieldBox,
                'bg-accent-soft/50 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]',
                hasQty && errors?.quantity ? 'border-danger' : 'border-accent/25',
              )}
            />
            {hasQty && errors?.quantity ? <p className="mt-2 text-[12px] text-danger">{errors.quantity}</p> : null}
          </div>

          {/* Price summary */}
          <dl className="rounded-xl border border-accent/20 bg-accent-soft/40 px-5 py-4">
            <div className="flex items-center justify-between py-1.5 text-[14px]">
              <dt className="text-muted">Rate per 1000</dt>
              <dd className="font-bold text-accent">{formatNaira(service.ratePer1kKobo)}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-accent/20 py-1.5 text-[14px]">
              <dt className="text-muted">Your Balance</dt>
              <dd className="font-bold text-accent">{formatNaira(user.balanceKobo)}</dd>
            </div>
            <div className="flex items-center justify-between pt-3">
              <dt className="text-[16px] font-semibold text-muted">Total Charge</dt>
              <dd className="text-[22px] font-extrabold text-accent">{formatNaira(total)}</dd>
            </div>
          </dl>

          {place.isSuccess ? (
            <div role="status" className="rounded-xl border border-accent/25 bg-accent-soft px-4 py-3 text-sm text-accent">
              <p className="font-bold">Order placed. {formatNaira(place.data.order.costKobo)} was taken from your wallet.</p>
              <p className="mt-1">
                We follow it for you and show its progress under{' '}
                <Link href="/dashboard/orders?tab=boost" className="font-bold underline">
                  Orders
                </Link>
                . If it can't be fully delivered, the undelivered part is refunded automatically.
              </p>
            </div>
          ) : null}
          {place.isError ? (
            <p role="alert" className="rounded-xl border border-danger/30 px-4 py-3 text-sm text-danger">
              {place.error instanceof ApiError ? place.error.message : 'Could not place this order. Try again.'}
            </p>
          ) : null}
          {hasQty && data && !enough ? (
            <p className="text-center text-sm text-muted">
              You need {formatNaira(total - user.balanceKobo)} more.{' '}
              <Link href="/dashboard/wallet" className="font-bold text-accent hover:underline">
                Fund wallet
              </Link>
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canPlace || place.isPending || place.isSuccess}
            className={cn(
              'inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-extrabold transition-[filter]',
              canPlace
                ? 'bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] text-white shadow-[0_14px_28px_-14px_var(--accent-ring)] hover:brightness-110'
                : 'cursor-not-allowed bg-surface-2 text-faint',
            )}
          >
            {canPlace && !place.isPending && !place.isSuccess ? <Icon name="cart" size={18} /> : null}
            {place.isPending ? 'Placing order…' : place.isSuccess ? 'Order Placed' : buttonLabel}
          </button>
        </form>
      </section>
    </div>
  );
}
