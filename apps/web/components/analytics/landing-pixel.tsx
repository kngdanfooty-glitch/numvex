'use client';

import { useEffect } from 'react';
import { trackTikTokEvent } from '@/lib/tiktok';

/** Sends TikTok `ViewContent` once when the landing page loads, listing the services the page shows. Rendered as a leaf so the page stays a server component. */
export function LandingPixel() {
  useEffect(() => {
    trackTikTokEvent('ViewContent', {
      contents: [
        { content_id: 'virtual_numbers', content_type: 'product', content_name: 'Virtual numbers' },
        { content_id: 'boosting', content_type: 'product', content_name: 'Boosting' },
        { content_id: 'number_rentals', content_type: 'product', content_name: 'Number rentals' },
      ],
    });
  }, []);
  return null;
}
