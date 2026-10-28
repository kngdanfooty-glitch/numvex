import type { Metadata } from 'next';
import { OrdersPage } from '@/components/numbers/orders-page';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  return <OrdersPage />;
}
