import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CenteredShell } from '../shells';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create your free NumVex account — virtual numbers, boosting and number rentals.',
  alternates: { canonical: '/register' },
};

export default function RegisterPage() {
  return (
    <CenteredShell>
    <Suspense>
      <RegisterForm />
    </Suspense>
    </CenteredShell>
  );
}
