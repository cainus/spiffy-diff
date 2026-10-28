import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowLeftRight, RotateCw, Sparkles } from 'lucide-react'
import { BackendPicker } from '@/components/backend-picker'
import { FilesView } from '@/components/files/files-view'
import { LocalCopyButton } from '@/components/local-copy-button'
import { SummaryView } from '@/components/summary/summary-view'
import { SummaryProgressBar } from '@/components/summary-progress'
import { VersionBanner } from '@/components/version-banner'
import { ExplainPopup } from '@/components/explain/explain-popup'
import { SelectionExplain } from '@/components/explain/selection-explain'
import { ExplainProvider } from '@/state/explain'
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
import { arrowKey } from '@/lib/keys'
import { sourceName } from '@/lib/source-name'
import { useAgentToggle } from '@/lib/use-agent-toggle'
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
  const latest = useRef(store)
  const agent = useAgentToggle()
  useLayoutEffect(() => {
    latest.current = store
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes an open explanation popup first. It does not also drill out.
      if (e.key === 'Escape' && document.querySelector('[data-explain-popup]')) return
      const typing = isTyping(e.target)
      // Escape drills out from anywhere. In a text box it also takes the focus away.
      const escape = e.key === 'Escape' && !e.defaultPrevented
      const back = (e.metaKey && e.key === '[') || (e.altKey && e.key === 'ArrowLeft')
      const backspace = e.key === 'Backspace' && !typing
      if (!escape && !back && !backspace) {
        if (typing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
        if (document.querySelector('[data-explain-popup]')) return
        // Enter on a focused button clicks it. Leave that to the button.
        if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.closest('button, a'))
          return
        const files = latest.current.source?.files.map((f) => f.path) ?? []
        const action = arrowKey(latest.current.nav, latest.current.summary, files, e.key)
        if (!action) return
        e.preventDefault()
        nav$(action)
        return
      }
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
    <ExplainProvider>
      <div className="flex h-screen flex-col">
        {/* Only empty header space drags the window. Drag regions can take clicks from controls inside them. */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b pr-3">
          <div className="app-drag w-20 self-stretch" />
          {/* The name stays still. It does not fly in from the start screen. */}
          <span className="shrink-0 text-sm font-semibold tracking-tight whitespace-nowrap">
            spiffy-diff
          </span>
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
            <Button
              size="sm"
              variant={agent.open ? 'secondary' : 'ghost'}
              aria-pressed={agent.open}
              title="Show or hide the agent"
              onClick={agent.toggle}
              className="gap-1.5"
            >
              <Sparkles className="size-3.5" />
              Agent
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Open a different PR or branch"
              onClick={store.close}
              className="gap-1.5"
            >
              <ArrowLeftRight className="size-3.5" />
              Change PR
            </Button>
          </div>
        </header>
        {store.source && <SourceName />}
        <VersionBanner />

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

        {/* An unpinned agent floats over the content. This box holds it. */}
        <div className="relative min-h-0 flex-1">
          <ResizablePanelGroup orientation="horizontal">
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
            <ResizableHandle className={cn(!agent.docked && 'hidden')} />
            <ResizablePanel
              panelRef={agent.panelRef}
              collapsible
              collapsedSize="0%"
              defaultSize={agent.docked ? '32%' : '0%'}
              minSize="20%"
              onResize={(size) => agent.sync(size.asPercentage > 0)}
              className={cn(agent.animating && 'transition-[flex-grow] duration-300 ease-out')}
            >
              {/* The panel stays mounted when it is closed or unpinned, so the conversation stays. */}
              <div
                data-agent-panel=""
                data-pinned={agent.pinned ? '' : undefined}
                hidden={!agent.open}
                className={cn(
                  'h-full',
                  !agent.pinned &&
                    'bg-background absolute inset-y-0 right-0 z-30 w-[min(28rem,85%)] border-l shadow-2xl',
                )}
              >
                <Suspense fallback={null}>
                  <AgentPanel
                    pinned={agent.pinned}
                    onPin={agent.togglePin}
                    onClose={agent.toggle}
                  />
                </Suspense>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <SelectionExplain />
        <ExplainPopup />
      </div>
    </ExplainProvider>
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

/** The PR or branch that you look at. It stays at the top at every level. */
function SourceName() {
  const { source, request } = useStore()
  if (!source) return null
  const name = sourceName(source, request)
  return (
    <div
      data-testid="source-name"
      className="bg-muted/30 flex h-11 shrink-0 items-center gap-3 border-b px-6"
    >
      <span className="bg-primary/10 text-primary shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold">
        {name.kind}
      </span>
      <span title={name.title} className="min-w-0 truncate text-base font-semibold tracking-tight">
        {name.title}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs">{name.where}</span>
    </div>
  )
}
