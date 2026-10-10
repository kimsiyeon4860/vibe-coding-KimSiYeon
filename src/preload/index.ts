// preload: 메인 프로세스와 화면 사이의 안전한 통로.
// 여기서 노출한 함수만 화면에서 window.api.xxx 로 쓸 수 있다.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AlarmState, PillMateApi } from '../shared/types'

/** 메인 → 화면 이벤트 구독. 반환값은 구독 해제 함수 */
function subscribe<T extends unknown[]>(channel: string, callback: (...args: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => callback(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PillMateApi = {
  supplements: {
    list: () => ipcRenderer.invoke('supplements:list'),
    create: (draft) => ipcRenderer.invoke('supplements:create', draft),
    update: (id, draft) => ipcRenderer.invoke('supplements:update', id, draft),
    setActive: (id, active) => ipcRenderer.invoke('supplements:set-active', id, active),
    remove: (id) => ipcRenderer.invoke('supplements:delete', id)
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings)
  },

  today: {
    get: () => ipcRenderer.invoke('today:get'),
    check: (planDate, productId, slot, action) => ipcRenderer.invoke('today:check', planDate, productId, slot, action),
    undo: (planDate, productId, slot) => ipcRenderer.invoke('today:undo', planDate, productId, slot),
    onChanged: (callback) => subscribe('today:changed', callback)
  },

  testAlarm: () => ipcRenderer.send('alarm:test'),

  alarm: {
    ready: () => ipcRenderer.invoke('alarm:ready'),
    onState: (callback) => subscribe<[AlarmState]>('alarm:state', callback),
    onRing: (callback) => subscribe('alarm:ring', callback),
    respond: (action) => ipcRenderer.send('alarm:respond', action)
  }
}

contextBridge.exposeInMainWorld('api', api)
