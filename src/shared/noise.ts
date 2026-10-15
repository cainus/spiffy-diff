const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
  'poetry.lock',
  'uv.lock',
  'Pipfile.lock',
  'Cargo.lock',
  'go.sum',
  'Gemfile.lock',
  'composer.lock',
  'Podfile.lock',
  'flake.lock',
])

const NOISE_PATTERNS = [
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /(^|\/)vendor\//,
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.generated\.\w+$/,
  /_pb2(_grpc)?\.pyi?$/,
  /\.pb\.go$/,
]

/** Noise is a file that a person does not review. See CONTEXT.md. */
export function isNoise(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return LOCKFILES.has(name) || NOISE_PATTERNS.some((p) => p.test(path))
}
