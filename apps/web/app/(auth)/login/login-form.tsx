'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginSchema } from '@numvexs/shared';
import { useLogin, useVerifyTwoFactor } from '@/lib/hooks';
import { ApiError, errorMessage } from '@/lib/api';
import { validate } from '@/lib/validation';
import { AuthError, AuthIcon, CodeInput, PasswordField, SubmitButton, TextField } from '../auth-ui';

/** Only follow same-origin redirect targets. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const verifyTwoFactor = useVerifyTwoFactor();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const goToNext = () => router.replace(safeNext(params.get('next')));

  // Validate with the shared schema (the API uses the very same one).
  const { data, errors } = validate(loginSchema, { identifier, password });
  const shown = submitted && errors ? errors : {};

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!data) return;
    login.mutate(data, {
      onSuccess: (res) => {
        if ('twoFactorRequired' in res) setPendingToken(res.pendingToken);
        else goToNext();
      },
      onError: (err) => {
        // Unverified accounts get sent to enter their emailed code.
        if (err instanceof ApiError && err.code === 'email_not_verified') {
          const details = err.details as { email?: string } | undefined;
          const email = details?.email ?? (identifier.includes('@') ? identifier.trim() : '');
          router.push(`/verify-email${email ? `?email=${encodeURIComponent(email)}` : ''}`);
        }
      },
    });
  };

  const submitCode = (value: string) => {
    if (!pendingToken || verifyTwoFactor.isPending) return;
    verifyTwoFactor.mutate({ pendingToken, code: value }, { onSuccess: goToNext });
  };

  if (pendingToken) {
    return (
      <>
        <AuthIcon name="shield" />
        <h1 className="auth-title">Two-factor authentication</h1>
        <p className="auth-subtitle">
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>
        <AuthError
          message={verifyTwoFactor.isError ? errorMessage(verifyTwoFactor.error, 'Could not verify that code') : ''}
        />
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitCode(code);
          }}
        >
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            disabled={verifyTwoFactor.isPending}
            invalid={verifyTwoFactor.isError}
          />
          <SubmitButton label="Verify" loading={verifyTwoFactor.isPending} disabled={code.length < 6} />
          <div className="auth-links">
            <button
              type="button"
              onClick={() => {
                setPendingToken(null);
                setCode('');
                verifyTwoFactor.reset();
              }}
            >
              Back to sign in
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <AuthIcon name="user" />
      <h1 className="auth-title">Welcome back</h1>
      <p className="auth-subtitle">Sign in to your NumVex account.</p>

      <AuthError message={login.isError ? errorMessage(login.error, 'Sign in failed') : ''} />

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <TextField
          label="Email or username"
          type="text"
          placeholder="you@example.com"
          autoFocus
          autoComplete="username"
          disabled={login.isPending}
          value={identifier}
          onChange={setIdentifier}
          error={shown.identifier}
        />
        <PasswordField
          label="Password"
          placeholder="Your password"
          autoComplete="current-password"
          disabled={login.isPending}
          value={password}
          onChange={setPassword}
          error={shown.password}
        />
        <div className="auth-links" style={{ justifyContent: 'flex-end', marginTop: -6 }}>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
        <SubmitButton label="Sign in" loading={login.isPending} />
        <div className="auth-links">
          <span>New to NumVex?</span>
          <Link href="/register">Create an account</Link>
        </div>
      </form>
    </>
  );
}
