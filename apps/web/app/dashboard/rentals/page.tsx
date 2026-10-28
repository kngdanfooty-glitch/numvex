import type { Metadata } from 'next';
import { RentalsPage } from '@/components/rentals/rentals-page';

export const metadata: Metadata = { title: 'Rent a Number' };

export default function Page() {
  return <RentalsPage />;
}
