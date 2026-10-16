import { describe, expect, it } from 'vitest'
import { splitTerms, termQuestion, type Term } from './terms'

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

describe('termQuestion', () => {
  it('asks a different question for each kind of term', () => {
    expect(termQuestion({ term: 'migration', kind: 'jargon' })).toBe(
      'What does the technical term "migration" mean? Explain it simply, and say how these changes use it.',
    )
    expect(termQuestion({ term: 'removal_owed', kind: 'code' })).toBe(
      'Explain the code concept "removal_owed" in this repository. Find where it is defined and what uses it.',
    )
    expect(termQuestion({ term: 'PA', kind: 'business' })).toBe(
      'Explain the business concept "PA" as this repository uses it. Find where the code uses it.',
    )
  })
})
