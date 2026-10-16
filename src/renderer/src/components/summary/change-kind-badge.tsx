import { Cog, Sparkles, Shuffle } from 'lucide-react'
import type { ChangeKind } from '@shared/summary'
import { cn } from '@/lib/utils'

const KINDS: Record<ChangeKind, { label: string; title: string; icon: typeof Cog; style: string }> =
  {
    feature: {
      label: 'New functionality',
      title: 'The software can do something new.',
      icon: Sparkles,
      style: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    },
    internal: {
      label: 'Internal change',
      title:
        'The behavior inside is different, for example performance, logging, metrics, or dependencies.',
      icon: Cog,
      style: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    },
    refactor: {
      label: 'Refactor',
      title: 'No behavior changes. The code moves or gets a new structure.',
      icon: Shuffle,
      style: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    },
  }

/** The kind of a change: new functionality, internal change, or refactor. */
export function ChangeKindBadge({ kind }: { kind: ChangeKind | undefined }) {
  if (!kind) return null
  const k = KINDS[kind]
  const Icon = k.icon
  return (
    <span
      title={k.title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        k.style,
      )}
    >
      <Icon className="size-3" />
      {k.label}
    </span>
  )
}
