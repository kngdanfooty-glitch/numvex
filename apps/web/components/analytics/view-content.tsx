'use client';

import { useEffect } from 'react';
import { trackTikTokEvent } from '@/lib/tiktok';

/** Sends TikTok `ViewContent` once when a product page opens. Rendered as a leaf so the page itself can stay a server component. */
export function ViewContentPixel({ id, name }: { id: string; name: string }) {
  useEffect(() => {
    trackTikTokEvent('ViewContent', { contents: [{ content_id: id, content_type: 'product', content_name: name }] });
  }, [id, name]);
  return null;
}
