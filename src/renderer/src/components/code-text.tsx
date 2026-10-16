import { splitCode } from '@shared/code-spans'

export const CODE_CLASS = 'bg-muted/60 rounded px-1 py-px font-mono text-[0.9em]'

/** Text that shows `code` as code, without the backticks. */
export function CodeText({ text }: { text: string }) {
  return (
    <>
      {splitCode(text).map((s, i) =>
        s.code ? (
          <code key={i} className={CODE_CLASS}>
            {s.text}
          </code>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}
