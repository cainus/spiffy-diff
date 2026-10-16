import { lazy, Suspense, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Skeleton } from '@/components/ui/skeleton'

// The diff renderer and its Shiki grammars load on first use, not at app start.
const PatchDiff = lazy(() => import('@pierre/diffs/react').then((m) => ({ default: m.PatchDiff })))

interface PatchViewProps {
  patch: string
  /** Wait this many ms before the diff renders, so that the zoom animation ends first. */
  delay?: number
  diffStyle?: 'unified' | 'split'
  /** The pointer enters or leaves a diff line. */
  onLineHover?: (line: LineHover | null) => void
}

export interface LineHover {
  side: 'deletions' | 'additions'
  lineNumber: number
  element: HTMLElement
}

interface LineEvent {
  annotationSide: 'deletions' | 'additions'
  lineNumber: number
  lineType: string
  lineElement: HTMLElement
}

/**
 * One file patch, rendered by @pierre/diffs. The renderer uses Shadow DOM, so it does
 * not take part in the shared-layout morph. It fades in after the card animation.
 */
export function PatchView({
  patch,
  delay = 220,
  diffStyle = 'unified',
  onLineHover,
}: PatchViewProps) {
  const [show, setShow] = useState(delay === 0)
  useEffect(() => {
    if (delay === 0) return
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  const skeleton = <Skeleton className="h-24 w-full rounded-lg" />
  if (!show) return skeleton
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="overflow-hidden rounded-lg border"
    >
      <Suspense fallback={skeleton}>
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
            onLineEnter: (e: LineEvent) =>
              onLineHover?.(
                e.lineType.startsWith('change-')
                  ? { side: e.annotationSide, lineNumber: e.lineNumber, element: e.lineElement }
                  : null,
              ),
            onLineLeave: () => onLineHover?.(null),
          }}
        />
      </Suspense>
    </motion.div>
  )
}
