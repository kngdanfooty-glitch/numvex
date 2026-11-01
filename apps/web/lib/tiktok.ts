import { koboToNaira } from '@numvexs/shared';

/** Safe wrappers around the TikTok Pixel (`window.ttq`, loaded in app/layout.tsx). They do nothing on the server or before the pixel loads. */
type Ttq = {
  track: (event: string, data?: Record<string, unknown>) => void;
  identify: (data: { email?: string; phone_number?: string }) => void;
};

function ttq(): Ttq | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { ttq?: Ttq }).ttq;
}

export function trackTikTokEvent(event: string, data: Record<string, unknown> = {}) {
  ttq()?.track?.(event, data);
}

/** Advanced Matching: TikTok hashes the email/phone in the browser. Call it once you know who the person is, before the event. */
export function identifyTikTokUser(data: { email?: string; phone_number?: string }) {
  ttq()?.identify?.(data);
}

/** TikTok `CompletePayment` for something bought from the wallet. `costKobo` is converted to naira, which is what TikTok expects. */
export function trackPurchase(id: string, name: string, costKobo: number) {
  trackTikTokEvent('CompletePayment', {
    contents: [{ content_id: id, content_type: 'product', content_name: name }],
    value: koboToNaira(costKobo),
    currency: 'NGN',
  });
}
