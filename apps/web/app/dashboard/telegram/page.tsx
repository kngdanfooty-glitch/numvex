import type { Metadata } from 'next';
import { ViewContentPixel } from '@/components/analytics/view-content';
import { TelegramPage } from '@/components/telegram/telegram-page';

export const metadata: Metadata = { title: 'Telegram Premium & Stars' };

export default function Page() {
  return (
    <>
      <ViewContentPixel id="telegram" name="Telegram Premium & Stars" />
      <TelegramPage />
    </>
  );
}
