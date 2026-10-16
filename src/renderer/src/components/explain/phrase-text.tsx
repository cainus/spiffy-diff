import { splitPhrases } from '@shared/terms'
import { anchorOf, useExplain } from '@/state/use-explain'

/** Split text at `code` spans. The parts do not have the backticks. */
function splitCode(text: string): { text: string; code: boolean }[] {
  return text
    .split(/(`[^`]+`)/g)
    .filter(Boolean)
    .map((s) =>
      /^`[^`]+`$/.test(s) ? { text: s.slice(1, -1), code: true } : { text: s, code: false },
    )
}

/**
 * Text that the user can select to explain. `code` shows as code. Phrases with a saved explanation
 * are underlined. A click on one opens its explanation. `onPhrase` replaces the click action,
 * for example inside a popup.
 */
export function PhraseText({
  text,
  onPhrase,
}: {
  text: string
  onPhrase?: (phrase: string, rect: DOMRect) => void
}) {
  const { phrases, open } = useExplain()
  const segments = splitCode(text)
  const plain = segments.map((s) => s.text).join('')
  let key = 0
  const render = (s: string) =>
    splitPhrases(s, phrases).map((part) =>
      part.phrase ? (
        <button
          key={key++}
          type="button"
          aria-label={`Explain ${part.phrase}`}
          title="Show the explanation"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            if (onPhrase) onPhrase(part.phrase!, rect)
            else open({ phrase: part.phrase!, context: plain }, anchorOf(rect))
          }}
          className="hover:text-foreground decoration-primary/60 cursor-help underline decoration-dotted underline-offset-4 transition-colors"
        >
          {part.text}
        </button>
      ) : (
        <span key={key++}>{part.text}</span>
      ),
    )
  return (
    <span data-explainable="">
      {segments.map((seg, i) =>
        seg.code ? (
          <code key={`c${i}`} className="bg-muted/60 rounded px-1 py-px font-mono text-[0.9em]">
            {render(seg.text)}
          </code>
        ) : (
          <span key={`t${i}`}>{render(seg.text)}</span>
        ),
      )}
    </span>
  )
}
