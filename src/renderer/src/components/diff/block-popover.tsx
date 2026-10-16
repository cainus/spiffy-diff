import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import type { Block } from '@shared/blocks'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { CodeText } from '@/components/code-text'
import { cn } from '@/lib/utils'

/**
 * The explanation of a block of red or green lines, at the line under the pointer.
 * BEFORE tells what the old code did. NOW tells what the new code does.
 */
export function BlockPopover({
  block,
  text,
  pending,
  rect,
}: {
  block: Block
  text: string | undefined
  pending: boolean
  rect: DOMRect
}) {
  const before = block.kind === 'before'
  return createPortal(
    <motion.div
      role="tooltip"
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.12 }}
      style={{
        position: 'fixed',
        left: Math.max(8, rect.left + 48),
        top: rect.bottom + 6,
        zIndex: 60,
      }}
      className={cn(
        'bg-popover text-popover-foreground pointer-events-none max-w-md rounded-lg border p-3 text-sm leading-relaxed shadow-lg',
        before ? 'border-l-4 border-l-red-500/70' : 'border-l-4 border-l-emerald-500/70',
      )}
    >
      <span className={cn('font-semibold', before ? 'text-red-400' : 'text-emerald-400')}>
        {before ? 'BEFORE:' : 'NOW:'}
      </span>{' '}
      {text ? (
        <CodeText text={text} />
      ) : pending ? (
        <Shimmer>The agent explains this code…</Shimmer>
      ) : (
        <span className="text-muted-foreground italic">Rerun the change to explain this code.</span>
      )}
    </motion.div>,
    document.body,
  )
}
