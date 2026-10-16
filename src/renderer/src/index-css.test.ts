import { describe, expect, it } from 'vitest'
import css from './index.css?raw'

// jsdom does not compute CSS, so the component tests cannot see this rule.
describe('index.css', () => {
  it('lets you select every text that you can explain, also outside p and h1 elements', () => {
    const rule = /([^{}]*)\{\s*user-select:\s*text;/.exec(css)
    expect(rule?.[1]).toContain('[data-explainable]')
  })
})
