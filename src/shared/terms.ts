/** One event while the agent explains a phrase. `reset` clears text that narrated the search. */
export type TermEvent =
  { type: 'activity'; text: string } | { type: 'text'; delta: string } | { type: 'reset' }

/** A saved explanation of a phrase that the user selected. */
export interface Explanation {
  phrase: string
  text: string
}

export interface PhrasePart {
  text: string
  /** The explained phrase that this part matches. */
  phrase?: string
}

/** The key of a phrase in the explanation cache. */
export function phraseKey(phrase: string): string {
  return phrase.trim().replace(/\s+/g, ' ').toLowerCase()
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Split text into plain parts and the phrases that the user had explained. The longest phrase wins.
 * A phrase matches without case, and a word character at its edge must not touch another word character.
 */
export function splitPhrases(text: string, phrases: string[]): PhrasePart[] {
  const usable = [...new Set(phrases.map((p) => p.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
  if (usable.length === 0) return [{ text }]
  const byKey = new Map(usable.map((p) => [phraseKey(p), p]))
  const alternatives = usable.map((p) => {
    const start = /^\w/.test(p) ? '(?<!\\w)' : ''
    const end = /\w$/.test(p) ? '(?!\\w)' : ''
    return `${start}${escape(p).replace(/\s+/g, '\\s+')}${end}`
  })
  const pattern = new RegExp(alternatives.join('|'), 'gi')

  const parts: PhrasePart[] = []
  let last = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    parts.push({ text: m[0], phrase: byKey.get(phraseKey(m[0])) })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts.length ? parts : [{ text }]
}
