import type { Metadata } from 'next';
import { EsimPage } from '@/components/esim/esim-page';

export const metadata: Metadata = { title: 'eSIMs' };

export default function Page() {
  return <EsimPage />;
}
