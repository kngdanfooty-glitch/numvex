import { renderIcon } from '@/lib/pwa-icon';

// iPhone and iPad home-screen icon. iOS rounds the corners itself, so this one is a full square.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return renderIcon(180, { square: true });
}
