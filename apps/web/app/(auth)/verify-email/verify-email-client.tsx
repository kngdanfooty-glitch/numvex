'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AUTH_CODE_LENGTH, emailSchema, verifyEmailSchema } from '@numvexs/shared';
import { useResendVerification, useVerifyEmail } from '@/lib/hooks';
import { errorMessage } from '@/lib/api';
import { useCooldown } from '@/lib/use-cooldown';
import { validate } from '@/lib/validation';
import { AuthError, AuthIcon, CodeInput, SubmitButton, TextField } from '../auth-ui';

const RESEND_SECONDS = 30;

export function VerifyEmailClient() {
  const router = useRouter();
  const params = useSearchParams();
  const emailParam = params.get('email') ?? '';
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const cooldown = useCooldown(RESEND_SECONDS, Boolean(emailParam));
  const [email, setEmail] = useState(emailParam);
  const [code, setCode] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);

  // Check email + code with the same schema the API uses.
  const { data, errors } = validate(verifyEmailSchema, { email, code });
  // The email box only exists when the page was opened without ?email=.
  const emailError = emailTouched ? errors?.email : undefined;
  const emailOk = emailSchema.safeParse(email).success;

  // Land on the dashboard shortly after a successful verification.
  useEffect(() => {
    if (!verify.isSuccess) return;
    const t = setTimeout(() => router.replace('/dashboard'), 1400);
    return () => clearTimeout(t);
  }, [verify.isSuccess, router]);

  const submit = () => {
    setEmailTouched(true);
    if (!data || verify.isPending) return;
    verify.mutate(data);
  };

  const onResend = () => {
    if (!emailOk) return setEmailTouched(true);
    resend.mutate({ email: email.trim().toLowerCase() }, { onSuccess: () => cooldown.start() });
    setCode('');
    verify.reset();
  };

  if (verify.isSuccess) {
    return (
      <>
        <AuthIcon name="check" tone="ok" />
        <h1 className="auth-title">Email verified</h1>
        <p className="auth-subtitle">You&apos;re all set. Taking you to your dashboard…</p>
      </>
    );
  }

  return (
    <>
      <AuthIcon name="mail" />
      <h1 className="auth-title">Check your email</h1>
      <p className="auth-subtitle">
        {emailParam ? (
          <>
            We sent a 6-digit verification code to <strong>{emailParam}</strong>. Enter it below to
            activate your account.
          </>
        ) : (
          'Enter your email and the 6-digit verification code we sent you.'
        )}
      </p>

      <AuthError
        message={
          verify.isError
            ? errorMessage(verify.error, 'That code is invalid or has expired.')
            : resend.isError
              ? errorMessage(resend.error, 'Could not resend the code')
              : ''
        }
      />
      {resend.isSuccess ? (
        <div className="auth-notice" role="status">
          If that email needs verifying, a new code is on its way.
        </div>
      ) : null}

      <form
        className="auth-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!emailParam ? (
          <TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            onBlur={() => setEmailTouched(true)}
            error={emailError}
          />
        ) : null}

        <CodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (verify.isError) verify.reset();
          }}
          onComplete={(full) => {
            // Typing the 6th digit submits automatically (state hasn't updated yet, so pass it in).
            const r = validate(verifyEmailSchema, { email, code: full });
            if (r.data && !verify.isPending) verify.mutate(r.data);
            else setEmailTouched(true);
          }}
          disabled={verify.isPending}
          invalid={verify.isError}
          autoFocus={Boolean(emailParam)}
        />

        <SubmitButton
          label="Verify email"
          loading={verify.isPending}
          disabled={code.length < AUTH_CODE_LENGTH}
        />

        <div className="auth-links">
          <span>Didn&apos;t get it?</span>
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
