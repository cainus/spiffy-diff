import { splitCode } from '@shared/code-spans'
import { splitPhrases } from '@shared/terms'
import { CODE_CLASS } from '@/components/code-text'
import { anchorOf, useExplain } from '@/state/use-explain'

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
          <code key={`c${i}`} className={CODE_CLASS}>
            {render(seg.text)}
          </code>
        ) : (
          <span key={`t${i}`}>{render(seg.text)}</span>
        ),
      )}
    </span>
  )
}
