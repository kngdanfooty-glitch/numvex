import type { ReactNode } from 'react';

/** A dashboard section title with the accent "⟩" arrow in front (same marker as smsgecko). */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="section-kicker text-[18.5px] font-extrabold leading-none">{children}</h2>;
}
