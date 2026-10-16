import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FolderGit2, GitPullRequest, Loader2 } from 'lucide-react'
import { parsePrUrl } from '@shared/source'
import type { BranchList } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { BackendPicker } from '@/components/backend-picker'
import { spring } from '@/lib/motion'
import { useStore } from '@/state/use-store'

export function StartScreen() {
  const { open, status, error } = useStore()
  const [url, setUrl] = useState('')
  const [repo, setRepo] = useState<{ path: string; list: BranchList } | null>(null)
  const [branch, setBranch] = useState('')
  const [dirty, setDirty] = useState(false)
  const busy = status === 'loading'
  const validUrl = parsePrUrl(url) !== null

  const pickRepo = async () => {
    const path = await window.spiffy.pickRepoFolder()
    if (!path) return
    const list = await window.spiffy.listBranches(path)
    setRepo({ path, list })
    setBranch(list.current)
  }

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden">
      <div className="spiffy-glow pointer-events-none absolute inset-0" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
        className="relative z-10 w-full max-w-xl space-y-8 px-6"
      >
        <div className="space-y-2 text-center">
          <motion.h1
            layoutId="brand"
            className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-6xl font-semibold tracking-tight text-transparent"
          >
            spiffy-diff
          </motion.h1>
          <p className="text-muted-foreground">
            spiffy-diff explains a pull request or a branch from the top down.
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (validUrl) void open({ kind: 'pr', url })
          }}
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <GitPullRequest className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/123"
                className="h-11 pl-9"
              />
            </div>
            <Button type="submit" size="lg" className="h-11" disabled={!validUrl || busy}>
              {busy ? <Loader2 className="animate-spin" /> : 'Explain'}
            </Button>
          </div>
        </form>

        <div className="text-muted-foreground flex items-center gap-3 text-xs tracking-widest uppercase">
          <div className="bg-border h-px flex-1" />
          or a local branch
          <div className="bg-border h-px flex-1" />
        </div>

        <div className="space-y-3">
          <Button
            variant="outline"
            className="h-11 w-full justify-start gap-2"
            onClick={() => void pickRepo()}
          >
            <FolderGit2 className="size-4" />
            <span className="truncate">{repo ? repo.path : 'Select a repository folder'}</span>
          </Button>
          <AnimatePresence>
            {repo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={spring}
                className="space-y-3 overflow-hidden"
              >
                <div className="flex gap-2">
                  <Select value={branch} onValueChange={setBranch}>
                    <SelectTrigger className="h-11 flex-1">
                      <SelectValue placeholder="Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {repo.list.branches.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                          {b === repo.list.current ? ' (current)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="lg"
                    className="h-11"
                    disabled={!branch || busy}
                    onClick={() =>
                      void open({
                        kind: 'branch',
                        repoPath: repo.path,
                        branch,
                        includeUncommitted: dirty,
                      })
                    }
                  >
                    Explain
                  </Button>
                </div>
                <label className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Switch
                    checked={dirty}
                    onCheckedChange={setDirty}
                    disabled={branch !== repo.list.current}
                  />
                  Include uncommitted changes
                </label>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-muted-foreground">Agent:</span>
          <BackendPicker />
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-destructive text-center text-sm"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
