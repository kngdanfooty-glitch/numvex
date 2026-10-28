import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SmmOrderPage } from '@/components/dashboard/smm-order-page';

export const metadata: Metadata = { title: 'Place SMM Order' };

export default function Page() {
  return (
    <Suspense>
      <SmmOrderPage />
    </Suspense>
  );
}
