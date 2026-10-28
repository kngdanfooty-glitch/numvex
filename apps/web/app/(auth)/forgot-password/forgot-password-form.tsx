'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { forgotPasswordSchema } from '@numvexs/shared';
import { useForgotPassword } from '@/lib/hooks';
import { errorMessage } from '@/lib/api';
import { validate } from '@/lib/validation';
import { AuthError, AuthIcon, SubmitButton, TextField } from '../auth-ui';

export function ForgotPasswordForm() {
  const router = useRouter();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data, errors } = validate(forgotPasswordSchema, { email });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!data) return;
    // The API answers the same whether or not the account exists, so we always move on.
    forgot.mutate(data, {
      onSuccess: () => router.push(`/reset-password?email=${encodeURIComponent(data.email)}`),
    });
  };

  return (
    <>
      <AuthIcon name="key" />
      <h1 className="auth-title">Forgot your password?</h1>
      <p className="auth-subtitle">
        Enter the email you signed up with and we&apos;ll send you a 6-digit code to reset it.
      </p>

      <AuthError message={forgot.isError ? errorMessage(forgot.error, 'Could not send the code') : ''} />

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoFocus
          autoComplete="email"
          disabled={forgot.isPending}
          value={email}
          onChange={setEmail}
          onBlur={() => setTouched(true)}
          error={submitted || touched ? errors?.email : undefined}
        />
        <SubmitButton label="Send reset code" loading={forgot.isPending} />
        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </form>
    </>
  );
}
