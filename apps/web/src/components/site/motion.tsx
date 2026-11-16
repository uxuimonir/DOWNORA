import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

export const spring = { type: 'spring', stiffness: 120, damping: 20, mass: 0.9 } as const;

/** Fades and lifts content into place the first time it scrolls into view. */
export function Reveal({ children, delay = 0, y = 28, className, as = 'div', ...rest }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'li' } & HTMLMotionProps<'div'>) {
  const M = (as === 'li' ? motion.li : motion.div) as typeof motion.div;
  // Reduced motion: no reveal at all, content is simply there.
  if (useReducedMotion()) {
    return (
      <M className={className} {...rest}>
        {children}
      </M>
    );
  }
  return (
    <M
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ ...spring, delay }}
      className={className}
      {...rest}
    >
      {children}
    </M>
  );
}

/** A slow, gentle bob for decorative elements. Still when motion is reduced. */
export function Float({ children, className, delay = 0, distance = 10 }: { children: ReactNode; className?: string; delay?: number; distance?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={className}
      animate={reduce ? undefined : { y: [0, -distance, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      {children}
    </motion.div>
  );
}
