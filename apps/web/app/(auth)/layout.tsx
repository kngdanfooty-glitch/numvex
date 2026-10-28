import type { ReactNode } from 'react';
import './auth.css';

// Each auth page picks its own structure (see shells.tsx): sign in, sign up and the small recovery pages all look different.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
