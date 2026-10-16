import { MotionGlobalConfig } from 'motion/react'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Animations end at once in tests. The tests check where you land, not how.
MotionGlobalConfig.skipAnimations = true

// Node-environment tests share this file. They have no DOM.
if (typeof window !== 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia

  Element.prototype.scrollIntoView ??= function () {}
}

afterEach(() => cleanup())
