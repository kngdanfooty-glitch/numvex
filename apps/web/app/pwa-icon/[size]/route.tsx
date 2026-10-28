import { renderIcon } from '@/lib/pwa-icon';

// The icons the app manifest points at: /pwa-icon/192, /pwa-icon/512 and /pwa-icon/maskable (512, safe-zone padded).
const SIZES: Record<string, { px: number; maskable?: boolean }> = {
  '192': { px: 192 },
  '512': { px: 512 },
  maskable: { px: 512, maskable: true },
};

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const spec = SIZES[size];
  if (!spec) return new Response('Not found', { status: 404 });
  return renderIcon(spec.px, { maskable: spec.maskable });
}
