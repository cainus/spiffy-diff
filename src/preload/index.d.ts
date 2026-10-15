import type { SpiffyApi } from './index'

declare global {
  interface Window {
    spiffy: SpiffyApi
  }
}
