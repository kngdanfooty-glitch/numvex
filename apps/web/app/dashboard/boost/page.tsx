import type { Metadata } from 'next';
import { ViewContentPixel } from '@/components/analytics/view-content';
import { SmmServicesPage } from '@/components/dashboard/smm-services-page';

export const metadata: Metadata = { title: 'Social Media Services' };

export default function Page() {
  return (
    <>
      <ViewContentPixel id="boost_order" name="Boosting" />
      <SmmServicesPage />
    </>
  );
}
