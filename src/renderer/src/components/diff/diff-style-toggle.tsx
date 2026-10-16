import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDiffStyle, type DiffStyle } from '@/lib/diff-style'

/** Unified or side-by-side diffs, for every diff in the app. */
export function DiffStyleToggle() {
  const [style, setStyle] = useDiffStyle()
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      aria-label="Diff style"
      value={style}
      onValueChange={(v) => v && setStyle(v as DiffStyle)}
    >
      <ToggleGroupItem value="unified">Unified</ToggleGroupItem>
      <ToggleGroupItem value="split">Split</ToggleGroupItem>
    </ToggleGroup>
  )
}
