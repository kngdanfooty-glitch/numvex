import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SplitShell } from '../shells';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your NumVex account to buy numbers, boosts and rentals.',
  alternates: { canonical: '/login' },
};

export default function LoginPage() {
  return (
    <SplitShell>
    <Suspense>
      <LoginForm />
    </Suspense>
    </SplitShell>
  );
}
