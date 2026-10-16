import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { PatchDiff } from '@pierre/diffs/react'
import { Skeleton } from '@/components/ui/skeleton'

interface PatchViewProps {
  patch: string
  /** Wait this many ms before the diff renders, so that the zoom animation ends first. */
  delay?: number
  diffStyle?: 'unified' | 'split'
}

/**
 * One file patch, rendered by @pierre/diffs. The renderer uses Shadow DOM, so it does
 * not take part in the shared-layout morph. It fades in after the card animation.
 */
export function PatchView({ patch, delay = 220, diffStyle = 'unified' }: PatchViewProps) {
  const [show, setShow] = useState(delay === 0)
  useEffect(() => {
    if (delay === 0) return
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  if (!show) return <Skeleton className="h-24 w-full rounded-lg" />
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="overflow-hidden rounded-lg border"
    >
      <PatchDiff
        patch={patch}
        options={{
          theme: { dark: 'pierre-dark', light: 'pierre-light' },
          themeType: 'dark',
          diffStyle,
          lineDiffType: 'word-alt',
          hunkSeparators: 'line-info',
          overflow: 'wrap',
          disableFileHeader: true,
        }}
      />
    </motion.div>
  )
}
