import type { Metadata } from 'next';
import { ViewContentPixel } from '@/components/analytics/view-content';
import { EsimPage } from '@/components/esim/esim-page';

export const metadata: Metadata = { title: 'eSIMs' };

export default function Page() {
  return (
    <>
      <ViewContentPixel id="esim" name="eSIMs" />
      <EsimPage />
    </>
  );
}
