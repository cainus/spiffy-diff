import { describe, expect, it } from 'vitest'
import { parseMarkedTerms, splitTerms, type Term } from './terms'

const terms: Term[] = [
  { term: 'PA', kind: 'business' },
  { term: 'migration', kind: 'jargon' },
  { term: 'removal_owed', kind: 'code' },
  { term: 'PA queue', kind: 'business' },
]

describe('splitTerms', () => {
  it('splits text into plain parts and term parts', () => {
    expect(splitTerms('A migration rewrites removal_owed.', terms)).toEqual([
      { text: 'A ' },
      { text: 'migration', term: terms[1] },
      { text: ' rewrites ' },
      { text: 'removal_owed', term: terms[2] },
      { text: '.' },
    ])
  })

  it('prefers the longest term at a position', () => {
    expect(splitTerms('It goes to the PA queue.', terms)[1]).toEqual({
      text: 'PA queue',
      term: terms[3],
    })
  })

  it('matches whole words only, and ignores case for words', () => {
    expect(splitTerms('PAPER and Migration', terms)).toEqual([
      { text: 'PAPER and ' },
      { text: 'Migration', term: terms[1] },
    ])
  })

  it('returns the text as one part when there are no terms', () => {
    expect(splitTerms('Plain text.', [])).toEqual([{ text: 'Plain text.' }])
  })
})

describe('parseMarkedTerms', () => {
  it('turns [[term|kind]] markers into term parts and keeps the plain text', () => {
    expect(
      parseMarkedTerms(
        'A [[migration|jargon]] fills [[TaskTarget|code]] rows for the [[PA|business]].',
      ),
    ).toEqual([
      { text: 'A ' },
      { text: 'migration', term: { term: 'migration', kind: 'jargon' } },
      { text: ' fills ' },
      { text: 'TaskTarget', term: { term: 'TaskTarget', kind: 'code' } },
      { text: ' rows for the ' },
      { text: 'PA', term: { term: 'PA', kind: 'business' } },
      { text: '.' },
    ])
  })

  it('shows a marker with an unknown kind as plain text', () => {
    expect(parseMarkedTerms('A [[thing|other]] here.')).toEqual([{ text: 'A thing here.' }])
  })

  it('hides an incomplete marker at the end of streaming text', () => {
    expect(parseMarkedTerms('It uses a [[migr')).toEqual([{ text: 'It uses a ' }])
    expect(parseMarkedTerms('It uses a [[migration|jar')).toEqual([{ text: 'It uses a ' }])
  })

  it('treats a `backticked` name as a code term, except the term that the text explains', () => {
    expect(parseMarkedTerms('`TargetSpec` lists `tags` for a site.', 'TargetSpec')).toEqual([
      { text: 'TargetSpec lists ' },
      { text: 'tags', term: { term: 'tags', kind: 'code' } },
      { text: ' for a site.' },
    ])
  })

  it('hides an incomplete backtick span at the end of streaming text', () => {
    expect(parseMarkedTerms('It sets `sla3_pa')).toEqual([{ text: 'It sets ' }])
  })

  it('returns plain text when there are no markers', () => {
    expect(parseMarkedTerms('Plain.')).toEqual([{ text: 'Plain.' }])
  })
})
