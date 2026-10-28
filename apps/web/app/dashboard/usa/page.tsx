import type { Metadata } from 'next';
import { UsaNumbersPage } from '@/components/numbers/usa-numbers-page';

export const metadata: Metadata = { title: 'USA Numbers' };

export default function Page() {
  return <UsaNumbersPage />;
}
