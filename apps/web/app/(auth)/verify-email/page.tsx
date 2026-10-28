import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SimpleShell } from '../shells';
import { VerifyEmailClient } from './verify-email-client';

export const metadata: Metadata = {
  title: 'Verify your email',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <SimpleShell>
    <Suspense>
      <VerifyEmailClient />
    </Suspense>
    </SimpleShell>
  );
}
