import { lazy, Suspense, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, RotateCw, X } from 'lucide-react'
import { BackendPicker } from '@/components/backend-picker'
import { FilesView } from '@/components/files/files-view'
import { LocalCopyButton } from '@/components/local-copy-button'
import { SummaryView } from '@/components/summary/summary-view'
import { SummaryProgressBar } from '@/components/summary-progress'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { breadcrumbs, type NavState } from '@/lib/nav'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/use-store'

// The agent panel pulls in Streamdown and Shiki. It loads after the summary view.
const AgentPanel = lazy(() =>
  import('@/components/agent/agent-panel').then((m) => ({ default: m.AgentPanel })),
)

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  )
}

export function Workspace() {
  const store = useStore()
  const { nav, nav$, summary, status, error } = store

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target)
      // Escape drills out from anywhere. In a text box it also takes the focus away.
      const escape = e.key === 'Escape' && !e.defaultPrevented
      const back = (e.metaKey && e.key === '[') || (e.altKey && e.key === 'ArrowLeft')
      const backspace = e.key === 'Backspace' && !typing
      if (!escape && !back && !backspace) return
      e.preventDefault()
      if (typing && e.target instanceof HTMLElement) e.target.blur()
      nav$({ type: 'drillOut' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav$])

  const crumbs = breadcrumbs(nav, summary)
  const canGoBack = nav.mode === 'files' || nav.path.level !== 'source'

  return (
    <div className="flex h-screen flex-col">
      {/* Only empty header space drags the window. Drag regions can take clicks from controls inside them. */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b pr-3">
        <div className="app-drag w-20 self-stretch" />
        <motion.span layoutId="brand" className="text-sm font-semibold tracking-tight">
          spiffy
        </motion.span>
        <AnimatePresence initial={false}>
          {canGoBack && (
            <motion.div
              initial={{ opacity: 0, width: 0, scale: 0.6 }}
              animate={{ opacity: 1, width: 'auto', scale: 1 }}
              exit={{ opacity: 0, width: 0, scale: 0.6 }}
              transition={spring}
            >
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Back"
                title="Back (Esc, ⌘[)"
                onClick={() => nav$({ type: 'drillOut' })}
              >
                <ArrowLeft className="size-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <Breadcrumb className="min-w-0 shrink">
          <BreadcrumbList className="flex-nowrap">
            <AnimatePresence initial={false} mode="popLayout">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1 && nav.mode === 'summary'
                return (
                  <motion.div
                    key={`${c.focus.level}-${c.label}`}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={spring}
                    className="flex min-w-0 items-center gap-1.5"
                  >
                    {i > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem className="min-w-0">
                      {last ? (
                        <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <button
                            className="max-w-60 truncate"
                            onClick={() => nav$({ type: 'jump', focus: c.focus })}
                          >
                            {c.label}
                          </button>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="app-drag min-w-4 flex-1 self-stretch" />
        <div className="flex items-center gap-3">
          <ModeToggle mode={nav.mode} onChange={(mode) => nav$({ type: 'mode', mode })} />
          <LocalCopyButton />
          <BackendPicker onChange={(b) => b !== store.backend && void store.resummarize(b)} />
          <Button
            size="icon-sm"
            variant="ghost"
            title="Summarize again"
            onClick={() => void store.resummarize()}
          >
            <RotateCw className={cn('size-4', status === 'summarizing' && 'animate-spin')} />
          </Button>
          <Button size="icon-sm" variant="ghost" title="Close" onClick={store.close}>
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <AnimatePresence>
        {(status === 'summarizing' || error) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden border-b"
          >
            <div className="px-6 py-2 text-sm">
              {error ? <span className="text-destructive">{error}</span> : <SummaryProgressBar />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="68%" minSize="40%">
          <div className="relative h-full overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={nav.mode}
                initial={{ opacity: 0, y: nav.mode === 'files' ? 24 : -24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: nav.mode === 'files' ? -24 : 24 }}
                transition={spring}
                className="h-full"
              >
                {nav.mode === 'summary' ? <SummaryView /> : <FilesView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="32%" minSize="20%">
          <Suspense fallback={null}>
            <AgentPanel />
          </Suspense>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: NavState['mode']
  onChange: (m: NavState['mode']) => void
}) {
  return (
    <div className="bg-muted/60 relative flex rounded-full p-0.5 text-xs">
      {(['summary', 'files'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            'relative z-10 rounded-full px-3 py-1 capitalize transition-colors',
            mode === m ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {mode === m && (
            <motion.span
              layoutId="mode-pill"
              transition={spring}
              className="bg-background absolute inset-0 -z-10 rounded-full shadow-sm"
            />
          )}
          {m}
        </button>
      ))}
    </div>
  )
}
