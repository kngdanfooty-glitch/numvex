import type { Metadata } from 'next';
import { WalletPage } from '@/components/dashboard/wallet-page';

export const metadata: Metadata = { title: 'Fund Wallet' };

export default function Page() {
  return <WalletPage />;
}
