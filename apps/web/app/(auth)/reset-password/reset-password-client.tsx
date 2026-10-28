'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { emailSchema, resetPasswordSchema } from '@numvexs/shared';
import { useForgotPassword, useResetPassword } from '@/lib/hooks';
import { errorMessage } from '@/lib/api';
import { useCooldown } from '@/lib/use-cooldown';
import { validate } from '@/lib/validation';
import { AuthError, AuthIcon, CodeInput, PasswordField, SubmitButton, TextField } from '../auth-ui';

const RESEND_SECONDS = 30;

// The API's reset schema + the "confirm password" box that only the form has.
const resetFormSchema = resetPasswordSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' });

export function ResetPasswordClient() {
  const params = useSearchParams();
  const emailParam = params.get('email') ?? '';
  const reset = useResetPassword();
  const resend = useForgotPassword();
  const cooldown = useCooldown(RESEND_SECONDS, Boolean(emailParam));
  const [email, setEmail] = useState(emailParam);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const { data, errors } = validate(resetFormSchema, { email, code, password, confirm });
  const show = (field: string) => (submitted || touched[field] ? errors?.[field] : undefined);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!data) return;
    reset.mutate({ email: data.email, code: data.code, password: data.password });
  };

  const onResend = () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return touch('email');
    resend.mutate({ email: parsed.data }, { onSuccess: () => cooldown.start() });
    setCode('');
    reset.reset();
  };

  if (reset.isSuccess) {
    return (
      <>
        <AuthIcon name="check" tone="ok" />
        <h1 className="auth-title">Password updated</h1>
        <p className="auth-subtitle">Your password has been changed. Sign in with your new password.</p>
        <div className="auth-form">
          <Link href="/login" className="auth-btn" style={{ textDecoration: 'none' }}>
            Continue to sign in
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthIcon name="lock" />
      <h1 className="auth-title">Reset your password</h1>
      <p className="auth-subtitle">
        {emailParam ? (
          <>
            If an account exists for <strong>{emailParam}</strong>, we sent it a 6-digit code. Enter
            it with your new password.
          </>
        ) : (
          'Enter your email, the 6-digit code we sent you, and a new password.'
        )}
      </p>

      <AuthError
        message={
          reset.isError
            ? errorMessage(reset.error, 'That code is invalid or has expired.')
            : resend.isError
              ? errorMessage(resend.error, 'Could not resend the code')
              : ''
        }
      />
      {resend.isSuccess ? (
        <div className="auth-notice" role="status">
          If an account exists, a new code is on its way.
        </div>
      ) : null}

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {!emailParam ? (
          <TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={setEmail}
            onBlur={() => touch('email')}
            error={show('email')}
          />
        ) : null}

        <div className="field">
          <label>Reset code</label>
          <CodeInput
            value={code}
            onChange={setCode}
            disabled={reset.isPending}
            invalid={reset.isError}
            autoFocus={Boolean(emailParam)}
          />
          {submitted && errors?.code ? <span className="field-error">{errors.code}</span> : null}
        </div>

        <PasswordField
          label="New password"
          placeholder="Create a new password"
          autoComplete="new-password"
          disabled={reset.isPending}
          value={password}
          onChange={setPassword}
          onBlur={() => touch('password')}
          error={show('password')}
          showStrength
        />
        <PasswordField
          label="Confirm new password"
          placeholder="Repeat your new password"
          autoComplete="new-password"
          disabled={reset.isPending}
          value={confirm}
          onChange={setConfirm}
          onBlur={() => touch('confirm')}
          error={show('confirm')}
        />

        <SubmitButton label="Reset password" loading={reset.isPending} />

        <div className="auth-links">
          <span>No code?</span>
          <button
            type="button"
            className="link-btn"
            onClick={onResend}
            disabled={cooldown.remaining > 0 || resend.isPending}
          >
            {cooldown.remaining > 0 ? `Resend in ${cooldown.remaining}s` : 'Resend code'}
          </button>
        </div>
        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </form>
    </>
  );
}
