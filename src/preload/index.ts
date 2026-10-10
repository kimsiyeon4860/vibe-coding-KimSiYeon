// preload: 메인 프로세스와 화면 사이의 안전한 통로.
// 여기서 노출한 함수만 화면에서 window.api.xxx 로 쓸 수 있다.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AlarmItem, PillMateApi } from '../shared/types'

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
    undo: (planDate, productId, slot) => ipcRenderer.invoke('today:undo', planDate, productId, slot)
  },

  testAlarm: () => ipcRenderer.send('alarm:test'),

  getAlarmItems: () => ipcRenderer.invoke('alarm:get-items'),

  onAlarmItems: (callback) => {
    const listener = (_event: IpcRendererEvent, items: AlarmItem[]): void => callback(items)
    ipcRenderer.on('alarm:items', listener)
    return () => ipcRenderer.removeListener('alarm:items', listener)
  },

  respondAlarm: (action) => ipcRenderer.send('alarm:respond', action)
}

contextBridge.exposeInMainWorld('api', api)
