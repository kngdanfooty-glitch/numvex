import type { Metadata } from 'next';
import { ComingSoon } from '@/components/dashboard/coming-soon';

export const metadata: Metadata = { title: 'Support' };

export default function Page() {
  return (
    <ComingSoon
      icon="support"
      title="Support"
      body="Chat with our team about an order, a payment or an account issue."
    />
  );
}
