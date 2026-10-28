import type { IconName } from '@/components/ui/icons';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

// One list drives the sidebar. Add a page here and it shows up in the menu.
export const MENU: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/dashboard/usa', label: 'USA Numbers', icon: 'number' },
  { href: '/dashboard/numbers', label: 'Buy Numbers', icon: 'number' },
  { href: '/dashboard/boost', label: 'Boost', icon: 'boost' },
  { href: '/dashboard/rentals', label: 'Rent a Number', icon: 'number' },
  { href: '/dashboard/esim', label: 'eSIMs', icon: 'esim' },
  { href: '/dashboard/telegram', label: 'Telegram Premium', icon: 'bluetick' },
  { href: '/dashboard/wallet', label: 'Fund Wallet', icon: 'wallet' },
];

export const ACCOUNT: NavItem[] = [
  { href: '/dashboard/history', label: 'History', icon: 'history' },
  { href: '/dashboard/orders', label: 'Orders', icon: 'orders' },
  { href: '/dashboard/profile', label: 'Profile', icon: 'profile' },
];
