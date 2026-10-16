/**
 * A word in an explanation that a reader can ask about.
 * - jargon: a general technical term, for example "migration".
 * - code: a concept of this code base, for example a function or a model name.
 * - business: a concept of the business, for example "PA" or "SLA 3".
 */
export interface Term {
  term: string
  kind: 'jargon' | 'code' | 'business'
}

/** One event while the agent explains a term. `reset` clears text that narrated the search. */
export type TermEvent =
  { type: 'activity'; text: string } | { type: 'text'; delta: string } | { type: 'reset' }

export interface TermPart {
  text: string
  term?: Term
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Split text into plain parts and term parts. The longest term wins. Words match whole and without case. */
export function splitTerms(text: string, terms: Term[]): TermPart[] {
  const usable = terms.filter((t) => t.term.trim()).sort((a, b) => b.term.length - a.term.length)
  if (usable.length === 0) return [{ text }]
  const byLower = new Map(usable.map((t) => [t.term.toLowerCase(), t]))
  const pattern = new RegExp(
    `(?<![\\w])(${usable.map((t) => escape(t.term)).join('|')})(?![\\w])`,
    'gi',
  )

  const parts: TermPart[] = []
  let last = 0
  for (const m of text.matchAll(pattern)) {
    const start = m.index
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: m[0], term: byLower.get(m[0].toLowerCase())! })
    last = start + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts.length ? parts : [{ text }]
}

const KINDS = new Set<Term['kind']>(['jargon', 'code', 'business'])

/**
 * Parse text with inline term markers, `[[term|kind]]`. The agent writes these in term explanations.
 * A name in backticks is a code term too, except `exclude` (the term that the text explains).
 * An incomplete marker or backtick span at the end (the text still streams) is hidden.
 */
export function parseMarkedTerms(text: string, exclude?: string): TermPart[] {
  let visible = text
  const open = visible.lastIndexOf('[[')
  if (open !== -1 && visible.indexOf(']]', open) === -1) visible = visible.slice(0, open)
  if ((visible.match(/`/g) ?? []).length % 2 === 1)
    visible = visible.slice(0, visible.lastIndexOf('`'))

  const parts: TermPart[] = []
  const plain = (s: string): void => {
    if (!s) return
    const last = parts[parts.length - 1]
    if (last && !last.term) last.text += s
    else parts.push({ text: s })
  }
  const termPart = (term: string, kind: Term['kind']): void => {
    if (exclude && term.toLowerCase() === exclude.toLowerCase()) plain(term)
    else parts.push({ text: term, term: { term, kind } })
  }
  let at = 0
  for (const m of visible.matchAll(/\[\[([^\]|]+)\|([^\]]+)\]\]|`([^`]+)`/g)) {
    plain(visible.slice(at, m.index))
    if (m[3] !== undefined) {
      termPart(m[3].trim(), 'code')
    } else {
      const term = m[1]!.trim()
      const kind = m[2]!.trim() as Term['kind']
      if (KINDS.has(kind)) termPart(term, kind)
      else plain(term)
    }
    at = m.index + m[0].length
  }
  plain(visible.slice(at))
  return parts.length ? parts : [{ text: '' }]
}
