/** Split text at `code` spans. The parts do not have the backticks. A lone backtick stays text. */
export function splitCode(text: string): { text: string; code: boolean }[] {
  return text
    .split(/(`[^`]+`)/g)
    .filter(Boolean)
    .map((s) =>
      /^`[^`]+`$/.test(s) ? { text: s.slice(1, -1), code: true } : { text: s, code: false },
    )
}

/** The text without the backticks of its code spans. */
export function stripCode(text: string): string {
  return splitCode(text)
    .map((s) => s.text)
    .join('')
}
