import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-20 py-16 sm:py-24', className)}>
      {children}
    </section>
  );
}

/** A big section title with the accent "⟩" arrow in front, plus an optional sentence under it. */
export function SectionHeading({
  title,
  children,
  align = 'center',
}: {
  title: ReactNode;
  children?: ReactNode;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <h2 className="section-kicker text-3xl font-extrabold sm:text-5xl">{title}</h2>
      {children ? <p className="mt-4 text-base leading-relaxed text-muted">{children}</p> : null}
    </div>
  );
}
