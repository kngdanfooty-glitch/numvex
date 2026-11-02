import type { Metadata } from 'next';
import { ViewContentPixel } from '@/components/analytics/view-content';
import { UsaNumbersPage } from '@/components/numbers/usa-numbers-page';

export const metadata: Metadata = { title: 'USA Numbers' };

export default function Page() {
  return (
    <>
      <ViewContentPixel id="usa_number" name="USA numbers" />
      <UsaNumbersPage />
    </>
  );
}
