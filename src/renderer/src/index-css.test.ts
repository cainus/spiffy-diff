/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// jsdom does not compute CSS, so the component tests cannot see this rule.
// Vitest also gives an empty string for a CSS import, so the test reads the file.
describe('index.css', () => {
  it('lets you select every text that you can explain, also outside p and h1 elements', () => {
    const css = readFileSync(join(import.meta.dirname, 'index.css'), 'utf8')
    const rule = /([^{}]*)\{\s*user-select:\s*text;/.exec(css)
    expect(rule?.[1]).toContain('[data-explainable]')
  })
})
