import type { Metadata } from 'next';
import { SimpleShell } from '../shells';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password',
  alternates: { canonical: '/forgot-password' },
};

export default function ForgotPasswordPage() {
  return (
    <SimpleShell>
      <ForgotPasswordForm />
    </SimpleShell>
  );
}
