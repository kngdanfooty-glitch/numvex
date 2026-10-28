import type { Metadata } from 'next';
import { SmmServicesPage } from '@/components/dashboard/smm-services-page';

export const metadata: Metadata = { title: 'Social Media Services' };

export default function Page() {
  return <SmmServicesPage />;
}
