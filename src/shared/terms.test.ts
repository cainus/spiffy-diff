import { describe, expect, it } from 'vitest'
import { phraseKey, splitPhrases } from './terms'

describe('splitPhrases', () => {
  it('splits text into plain parts and the phrases that the user had explained', () => {
    expect(
      splitPhrases('A migration rewrites removal_owed.', ['migration', 'removal_owed']),
    ).toEqual([
      { text: 'A ' },
      { text: 'migration', phrase: 'migration' },
      { text: ' rewrites ' },
      { text: 'removal_owed', phrase: 'removal_owed' },
      { text: '.' },
    ])
  })

  it('prefers the longest phrase at a position', () => {
    expect(splitPhrases('It goes to the PA queue.', ['PA', 'PA queue'])[1]).toEqual({
      text: 'PA queue',
      phrase: 'PA queue',
    })
  })

  it('matches whole words, ignores case, and keeps the text as written', () => {
    expect(splitPhrases('PAPER and Migration', ['migration', 'pa'])).toEqual([
      { text: 'PAPER and ' },
      { text: 'Migration', phrase: 'migration' },
    ])
  })

  it('matches a phrase that starts or ends with a symbol', () => {
    expect(splitPhrases('Call retry() now.', ['retry()'])).toEqual([
      { text: 'Call ' },
      { text: 'retry()', phrase: 'retry()' },
      { text: ' now.' },
    ])
  })

  it('returns the text as one part when there are no phrases', () => {
    expect(splitPhrases('Plain text.', [])).toEqual([{ text: 'Plain text.' }])
  })
})

describe('phraseKey', () => {
  it('ignores case and extra white space', () => {
    expect(phraseKey('  PA   queue ')).toBe(phraseKey('pa queue'))
  })
})
