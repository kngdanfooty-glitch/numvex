import type { Metadata } from 'next';
import { TelegramPage } from '@/components/telegram/telegram-page';

export const metadata: Metadata = { title: 'Telegram Premium & Stars' };

export default function Page() {
  return <TelegramPage />;
}
