import { describe, expect, it } from 'vitest'
import { isNoise } from './noise'

describe('isNoise', () => {
  it.each([
    'package-lock.json',
    'frontend/yarn.lock',
    'pnpm-lock.yaml',
    'backend/poetry.lock',
    'uv.lock',
    'Cargo.lock',
    'go.sum',
    'Gemfile.lock',
    'src/__snapshots__/app.test.ts.snap',
    'vendor/github.com/x/y.go',
    'web/dist/app.min.js',
    'styles/site.min.css',
    'api/schema.generated.ts',
    'proto/user_pb2.py',
  ])('treats %s as noise', (path) => {
    expect(isNoise(path)).toBe(true)
  })

  it.each(['src/app.ts', 'README.md', 'package.json', 'backend/pyproject.toml', 'src/vendors.ts'])(
    'does not treat %s as noise',
    (path) => {
      expect(isNoise(path)).toBe(false)
    },
  )
})
