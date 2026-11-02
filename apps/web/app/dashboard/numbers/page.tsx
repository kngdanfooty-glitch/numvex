import type { Metadata } from 'next';
import { ViewContentPixel } from '@/components/analytics/view-content';
import { NumbersPage } from '@/components/numbers/numbers-page';

export const metadata: Metadata = { title: 'Buy Numbers' };

export default function Page() {
  return (
    <>
      <ViewContentPixel id="virtual_number" name="Virtual numbers" />
      <NumbersPage />
    </>
  );
}
