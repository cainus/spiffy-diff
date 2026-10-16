import type { Transition, Variants } from 'motion/react'

export const spring: Transition = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 }
const softSpring: Transition = { type: 'spring', stiffness: 220, damping: 30 }

/**
 * The zoom for one level of the summary.
 * Drill in: the old level grows and fades behind you, the new level comes from small to full size.
 * Drill out: the reverse.
 */
export const levelVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, scale: dir > 0 ? 0.9 : 1.1, filter: 'blur(6px)' }),
  center: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: { ...softSpring, staggerChildren: 0.045, delayChildren: 0.08 },
  },
  exit: (dir: number) => ({
    opacity: 0,
    scale: dir > 0 ? 1.12 : 0.88,
    filter: 'blur(6px)',
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  }),
}

export const itemVariants: Variants = {
  enter: { opacity: 0, y: 18, scale: 0.97 },
  center: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, transition: { duration: 0.12 } },
}

export const slideVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 48 : -48 }),
  center: { opacity: 1, x: 0, transition: spring },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -48 : 48, transition: { duration: 0.18 } }),
}
