import type { SpiffyBridge } from '@shared/ipc'

declare global {
  interface Window {
    spiffy: SpiffyBridge
  }
}
