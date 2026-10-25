import { useMemo, useState, type UIEvent } from 'react'
import { GitBranch, GitPullRequest, Search } from 'lucide-react'
import type { LoadRequest, SourceList } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  ago,
  candidateKey,
  filterCandidates,
  loadFilters,
  PAGE_SIZE,
  saveFilters,
  type KindFilter,
  type SourceFilters,
} from '@/lib/source-filter'

interface Props {
  repoPath: string
  list: SourceList
  busy: boolean
  onOpen: (req: LoadRequest) => void
}

const KINDS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'branch', label: 'Branches' },
  { value: 'pr', label: 'Pull requests' },
]

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: string
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={pressed ? 'secondary' : 'outline'}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/** Browse the branches and the open pull requests of a repository, and pick one. */
export function SourcePicker({ repoPath, list, busy, onOpen }: Props) {
  const [filters, setFilters] = useState(loadFilters)
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [picked, setPicked] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const matches = useMemo(
    () => filterCandidates(list.candidates, filters, query),
    [list, filters, query],
  )
  const selected = list.candidates.find((c) => candidateKey(c) === picked) ?? null

  const change = (next: Partial<SourceFilters>) => {
    const merged = { ...filters, ...next }
    setFilters(merged)
    saveFilters(merged)
    setShown(PAGE_SIZE)
  }

  // Page by page: the next page loads when the scroll nears the end of the list.
  const onScroll = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      setShown((n) => Math.min(n + PAGE_SIZE, matches.length))
    }
  }

  const open = (c = selected) => {
    if (!c) return
    onOpen(
      c.kind === 'pr'
        ? { kind: 'pr', url: c.url }
        : {
            kind: 'branch',
            repoPath,
            branch: c.name,
            includeUncommitted: dirty && c.current,
          },
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShown(PAGE_SIZE)
          }}
          placeholder="Search branches and pull requests"
          aria-label="Search branches and pull requests"
          className="h-10 pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {KINDS.map((k) => (
          <Chip
            key={k.value}
            pressed={filters.kind === k.value}
            onClick={() => change({ kind: k.value })}
          >
            {k.label}
          </Chip>
        ))}
        <span className="bg-border mx-1 h-4 w-px" />
        <Chip pressed={filters.mine} onClick={() => change({ mine: !filters.mine })}>
          Mine
        </Chip>
        <Chip
          pressed={filters.hideMerged}
          onClick={() => change({ hideMerged: !filters.hideMerged })}
        >
          Has changes
        </Chip>
        <span className="text-muted-foreground ml-auto text-xs">
          {matches.length} of {list.candidates.length}
        </span>
      </div>

      <ul
        aria-label="Branches and pull requests"
        onScroll={onScroll}
        className="max-h-72 divide-y overflow-y-auto rounded-lg border"
      >
        {matches.slice(0, shown).map((c) => {
          const key = candidateKey(c)
          const Icon = c.kind === 'pr' ? GitPullRequest : GitBranch
          return (
            <li key={key}>
              <button
                type="button"
                aria-pressed={picked === key}
                onClick={() => setPicked(key)}
                onDoubleClick={() => {
                  setPicked(key)
                  if (!busy) open(c)
                }}
                className={cn(
                  'hover:bg-accent flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm',
                  picked === key && 'bg-accent',
                )}
              >
                <Icon className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {c.kind === 'pr' ? (
                      <>
                        <span className="text-muted-foreground">#{c.number}</span> {c.title}
                      </>
                    ) : (
                      c.name
                    )}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {[
                      c.kind === 'pr' ? c.branch : c.current ? 'current' : c.merged ? 'merged' : '',
                      c.author,
                      ago(c.updatedAt),
                      c.kind === 'pr' && c.draft ? 'draft' : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {matches.length === 0 && (
          <li className="text-muted-foreground px-3 py-6 text-center text-sm">
            Nothing matches the search and the filters.
          </li>
        )}
      </ul>

      <div className="flex items-center gap-3">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <Switch
            checked={dirty}
            onCheckedChange={setDirty}
            disabled={!(selected?.kind === 'branch' && selected.current)}
          />
          Include uncommitted changes
        </label>
        <Button
          size="lg"
          className="ml-auto h-11"
          disabled={!selected || busy}
          onClick={() => open()}
        >
          Explain
        </Button>
      </div>
    </div>
  )
}
