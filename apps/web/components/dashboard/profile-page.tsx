'use client';

import { capitalize } from '@/lib/name';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { changePasswordSchema, formatNigerianPhone } from '@numvexs/shared';
import { Icon, type IconName } from '@/components/ui/icons';
import { useChangePassword, useLogout, useMe } from '@/lib/hooks';
import { errorMessage } from '@/lib/api';
import { validate } from '@/lib/validation';
import { cn } from '@/lib/cn';

/* ---------- small building blocks ---------- */

/** A white rounded card with a tinted header strip (icon + title). */
function ProfileCard({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <header className="flex items-center gap-3 border-b border-border bg-bg-elevated px-6 py-[18px]">
        <Icon name={icon} size={22} className="text-accent" />
        <h2 className="text-[17.6px] font-bold">{title}</h2>
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

const inputBase =
  'h-[46px] w-full rounded-md border border-border-strong px-[17px] text-[14.4px] outline-none transition-colors';

/** A read-only value (shaded box) with a small hint under it. */
function ReadOnlyField({ icon, label, value, hint }: { icon: IconName; label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[13.6px] font-semibold">
        <Icon name={icon} size={14} className="text-muted" />
        {label}
      </div>
      <input readOnly value={value} aria-label={label} className={cn(inputBase, 'bg-surface-2 text-muted')} />
      {hint ? <p className="mt-1.5 text-[11.5px] text-faint">{hint}</p> : null}
    </div>
  );
}

/** An editable password box with an icon label, hint and error message. */
function PasswordInput({
  icon,
  label,
  hint,
  error,
  value,
  onChange,
  onBlur,
  autoComplete,
  disabled,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  autoComplete: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center gap-1.5 text-[13.6px] font-semibold">
        <Icon name={icon} size={14} className="text-muted" />
        {label}
      </div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={cn(
          inputBase,
          'bg-surface text-text focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] disabled:opacity-60',
          error && 'border-danger',
        )}
      />
      {error ? (
        <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[11.5px] text-faint">{hint}</p>
      ) : null}
    </label>
  );
}

/* ---------- change password ---------- */

// The API's schema + the "confirm" box that only the form has.
const changePasswordFormSchema = z
  .object({ currentPassword: z.string(), newPassword: z.string(), confirm: z.string() })
  .pipe(
    changePasswordSchema.and(z.object({ confirm: z.string() })).refine((v) => v.newPassword === v.confirm, {
      path: ['confirm'],
      message: 'Passwords do not match.',
    }),
  );

function ChangePasswordCard() {
  const change = useChangePassword();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const touch = (f: string) => setTouched((t) => ({ ...t, [f]: true }));

  const { data, errors } = validate(changePasswordFormSchema, { currentPassword, newPassword, confirm });
  const show = (f: string) => (submitted || touched[f] ? errors?.[f] : undefined);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!data) return;
    change.mutate(
      { currentPassword: data.currentPassword, newPassword: data.newPassword },
      {
        onSuccess: () => {
          setCurrent('');
          setNew('');
          setConfirm('');
          setTouched({});
          setSubmitted(false);
        },
      },
    );
  };

  return (
    <ProfileCard icon="lock" title="Change Password">
      {change.isError ? (
        <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {errorMessage(change.error, 'Could not update your password')}
        </div>
      ) : null}
      {change.isSuccess ? (
        <div role="status" className="mb-4 rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-sm text-success">
          Password updated. Your other devices have been signed out.
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
        <PasswordInput
          icon="lock"
          label="Current Password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(v) => {
            setCurrent(v);
            if (change.isError || change.isSuccess) change.reset();
          }}
          onBlur={() => touch('currentPassword')}
          error={show('currentPassword')}
          disabled={change.isPending}
        />
        <PasswordInput
          icon="key"
          label="New Password"
          hint="Minimum 8 characters, with a letter and a number"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNew}
          onBlur={() => touch('newPassword')}
          error={show('newPassword')}
          disabled={change.isPending}
        />
        <PasswordInput
          icon="checkcircle"
          label="Confirm New Password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          onBlur={() => touch('confirm')}
          error={show('confirm')}
          disabled={change.isPending}
        />
        <button
          type="submit"
          disabled={change.isPending}
          className="mt-1 inline-flex h-[39px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#3b82f6] to-[#1e3a8a] text-[13.6px] font-semibold text-white shadow-[0_10px_22px_-12px_var(--accent-ring)] transition-[filter] hover:brightness-110 disabled:opacity-60"
        >
          <Icon name="save" size={16} />
          {change.isPending ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </ProfileCard>
  );
}

/* ---------- the page ---------- */

export function ProfilePage() {
  const router = useRouter();
  const user = useMe().data?.user;
  const logout = useLogout();
  if (!user) return null;

  const memberSince = new Date(user.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="mx-auto max-w-[1150px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-[26px] font-extrabold text-accent">
          <Icon name="usercircle" size={34} />
          My Profile
        </h1>
        <Link
          href="/dashboard"
          className="inline-flex h-[37px] items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-[13.6px] font-semibold transition-colors hover:bg-surface-2"
        >
          <Icon name="back" size={15} />
          Back to Dashboard
        </Link>
      </div>

      <div className="mt-8 grid items-start gap-[29px] lg:grid-cols-2">
        <ProfileCard icon="idcard" title="Account Information">
          <div className="flex flex-col gap-[18px]">
            <ReadOnlyField icon="profile" label="Username" value={capitalize(user.username)} hint="Your username cannot be changed." />
            <ReadOnlyField icon="mail" label="Email Address" value={user.email} hint="Contact support to change your email." />
            <ReadOnlyField
              icon="phone"
              label="Phone Number"
              value={user.phone ? formatNigerianPhone(user.phone) : 'Not added'}
              hint="Contact support to change your phone number."
            />
            <ReadOnlyField icon="calendar" label="Member Since" value={memberSince} />
          </div>
        </ProfileCard>

        <div className="flex flex-col gap-[29px]">
          <ChangePasswordCard />

          <ProfileCard icon="sliders" title="Account Actions">
            <button
              onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
              disabled={logout.isPending}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-danger bg-surface text-[13.6px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
            >
              <Icon name="logout" size={16} />
              Log Out
            </button>
          </ProfileCard>
        </div>
      </div>
    </div>
  );
}
