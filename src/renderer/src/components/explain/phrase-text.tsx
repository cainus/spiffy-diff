import { splitPhrases } from '@shared/terms'
import { anchorOf, useExplain } from '@/state/use-explain'

/**
 * Text that the user can select to explain. Phrases with a saved explanation are underlined.
 * A click on one opens its explanation. `onPhrase` replaces the click action, for example inside the popup.
 */
export function PhraseText({
  text,
  onPhrase,
}: {
  text: string
  onPhrase?: (phrase: string) => void
}) {
  const { phrases, open } = useExplain()
  return (
    <span data-explainable="">
      {splitPhrases(text, phrases).map((part, i) =>
        part.phrase ? (
          <button
            key={i}
            type="button"
            aria-label={`Explain ${part.phrase}`}
            title="Show the explanation"
            onClick={(e) => {
              if (onPhrase) onPhrase(part.phrase!)
              else
                open(
                  { phrase: part.phrase!, context: text },
                  anchorOf(e.currentTarget.getBoundingClientRect()),
                )
            }}
            className="hover:text-foreground decoration-primary/60 cursor-help underline decoration-dotted underline-offset-4 transition-colors"
          >
            {part.text}
          </button>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  )
}
