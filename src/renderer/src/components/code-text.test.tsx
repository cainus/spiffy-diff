// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CodeText } from './code-text'

describe('CodeText', () => {
  it('shows `code` as code, without the backticks', () => {
    const { container } = render(<CodeText text="Adds `age` to `DataFound.build()`." />)

    expect(container.textContent).toBe('Adds age to DataFound.build().')
    expect([...container.querySelectorAll('code')].map((c) => c.textContent)).toEqual([
      'age',
      'DataFound.build()',
    ])
  })

  it('keeps a lone backtick as text', () => {
    const { container } = render(<CodeText text="A ` alone" />)
    expect(container.textContent).toBe('A ` alone')
    expect(container.querySelector('code')).toBeNull()
  })
})
