'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { registerSchema } from '@numvexs/shared';
import { useRegister } from '@/lib/hooks';
import { errorMessage } from '@/lib/api';
import { validate } from '@/lib/validation';
import { AuthError, AuthIcon, PasswordField, SubmitButton, TextField } from '../auth-ui';

// The API's register schema + two things only the form needs: "confirm password" and the terms box.
const registerFormSchema = registerSchema
  .extend({
    confirm: z.string(),
    terms: z.literal(true, 'Please accept the terms to continue.'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match.',
  });

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const register = useRegister();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [referral, setReferral] = useState(params.get('ref') ?? '');
  const [terms, setTerms] = useState(false);

  // Which fields has the user already visited (blurred)? We only show an error for those,
  // so the form doesn't shout at someone who hasn't typed anything yet.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const { data, errors } = validate(registerFormSchema, {
    email,
    phone,
    password,
    confirm,
    terms,
    username,
    referralCode: referral || undefined,
  });
  const show = (field: string) => (submitted || touched[field] ? errors?.[field] : undefined);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!data) return;
    register.mutate(
      {
        email: data.email,
        phone: data.phone, // already converted to +234… by the shared schema
        password: data.password,
        username: data.username,
        referralCode: data.referralCode,
      },
      // Email verification is off for now: they are already signed in, so go straight to the dashboard.
      // { onSuccess: () => router.push(`/verify-email?email=${encodeURIComponent(data.email)}`) },
      { onSuccess: () => router.push('/dashboard') },
    );
  };

  return (
    <>
      <AuthIcon name="user" />
      <h1 className="auth-title">Create your account</h1>
      <p className="auth-subtitle">Free to join — you only pay for what you order.</p>

      <AuthError message={register.isError ? errorMessage(register.error, 'Could not create account') : ''} />

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          disabled={register.isPending}
          value={email}
          onChange={setEmail}
          onBlur={() => touch('email')}
          error={show('email')}
        />
        <TextField
          label="Phone number"
          type="tel"
          inputMode="tel"
          placeholder="0803 123 4567"
          hint="Nigerian mobile number"
          autoComplete="tel-national"
          disabled={register.isPending}
          value={phone}
          onChange={setPhone}
          onBlur={() => touch('phone')}
          error={show('phone')}
        />
        <TextField
          label="Username"
          type="text"
          placeholder="Pick a username"
          autoComplete="username"
          disabled={register.isPending}
          value={username}
          onChange={setUsername}
          onBlur={() => touch('username')}
          error={show('username')}
        />
        <PasswordField
          label="Password"
          placeholder="Create a password"
          autoComplete="new-password"
          disabled={register.isPending}
          value={password}
          onChange={setPassword}
          onBlur={() => touch('password')}
          error={show('password')}
          showStrength
        />
        <PasswordField
          label="Confirm password"
          placeholder="Repeat your password"
          autoComplete="new-password"
          disabled={register.isPending}
          value={confirm}
          onChange={setConfirm}
          onBlur={() => touch('confirm')}
          error={show('confirm')}
        />
        <TextField
          label="Referral code"
          optional
          type="text"
          placeholder="Have a code?"
          autoComplete="off"
          disabled={register.isPending}
          value={referral}
          onChange={setReferral}
          onBlur={() => touch('referralCode')}
          error={show('referralCode')}
        />
        <label className="check-row">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>
            I agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
          </span>
        </label>
        {submitted && errors?.terms ? <span className="field-error">{errors.terms}</span> : null}

        <SubmitButton label="Create account" loading={register.isPending} />
        <div className="auth-links">
          <span>Already have an account?</span>
          <Link href="/login">Sign in</Link>
        </div>
      </form>
    </>
  );
}
