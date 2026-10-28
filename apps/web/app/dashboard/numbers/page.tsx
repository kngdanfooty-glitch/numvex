import type { Metadata } from 'next';
import { NumbersPage } from '@/components/numbers/numbers-page';

export const metadata: Metadata = { title: 'Buy Numbers' };

export default function Page() {
  return <NumbersPage />;
}
