import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SimpleShell } from '../shells';
import { ResetPasswordClient } from './reset-password-client';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <SimpleShell>
    <Suspense>
      <ResetPasswordClient />
    </Suspense>
    </SimpleShell>
  );
}
