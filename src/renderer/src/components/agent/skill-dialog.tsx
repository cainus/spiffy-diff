import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Skill } from '@/lib/skills'

interface Props {
  /** The skill to edit, or null to make a new one. */
  skill: Skill | null
  onSave: (skill: Skill) => void
  onDelete: (id: string) => void
  onClose: () => void
}

/** The form that adds or edits a skill. Mount it only while it is open. */
export function SkillDialog({ skill, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(skill?.name ?? '')
  const [prompt, setPrompt] = useState(skill?.prompt ?? '')
  const valid = name.trim() !== '' && prompt.trim() !== ''

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            onSave({
              id: skill?.id ?? crypto.randomUUID(),
              name: name.trim(),
              prompt: prompt.trim(),
            })
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>{skill ? 'Edit skill' : 'New skill'}</DialogTitle>
            <DialogDescription>
              The skill button sends this prompt to the agent. The agent answers in the panel.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Skill name"
            placeholder="Name, for example: Find bugs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <Textarea
            aria-label="Skill prompt"
            placeholder="What should the agent do?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <DialogFooter>
            {skill && (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                onClick={() => {
                  onDelete(skill.id)
                  onClose()
                }}
              >
                Delete
              </Button>
            )}
            <Button type="submit" disabled={!valid}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
