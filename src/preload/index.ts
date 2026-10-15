import { contextBridge } from 'electron'

const api = {
  platform: process.platform,
}

export type SpiffyApi = typeof api

contextBridge.exposeInMainWorld('spiffy', api)
