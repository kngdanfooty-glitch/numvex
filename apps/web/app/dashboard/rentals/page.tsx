import type { Metadata } from 'next';
import { ViewContentPixel } from '@/components/analytics/view-content';
import { RentalsPage } from '@/components/rentals/rentals-page';

export const metadata: Metadata = { title: 'Rent a Number' };

export default function Page() {
  return (
    <>
      <ViewContentPixel id="number_rental" name="Number rentals" />
      <RentalsPage />
    </>
  );
}
