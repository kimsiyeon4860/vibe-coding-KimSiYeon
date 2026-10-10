// 화면(렌더러)의 요청을 core/api로 연결한다. 채널 이름은 '영역:동작'.
import { ipcMain } from 'electron'
import type { CoreApi } from '../core/api'

export function registerCoreIpc(core: CoreApi): void {
  const handle = (channel: string, fn: (...args: unknown[]) => unknown) =>
    ipcMain.handle(channel, (_event, ...args: unknown[]) => fn(...args))

  handle('supplements:list', core.supplements.list)
  handle('supplements:create', (draft) => core.supplements.create(draft))
  handle('supplements:update', (id, draft) => core.supplements.update(id, draft))
  handle('supplements:set-active', (id, active) => core.supplements.setActive(id, active))
  handle('supplements:delete', (id) => core.supplements.remove(id))
  handle('supplements:apply-schedule', (changes) => core.supplements.applySchedule(changes))

  handle('prescriptions:list', core.prescriptions.list)
  handle('prescriptions:create', (draft) => core.prescriptions.create(draft))
  handle('prescriptions:update', (id, draft) => core.prescriptions.update(id, draft))
  handle('prescriptions:set-active', (id, active) => core.prescriptions.setActive(id, active))
  handle('prescriptions:delete', (id) => core.prescriptions.remove(id))

  handle('settings:get', core.settings.get)
  handle('settings:save', (raw) => core.settings.save(raw))

  handle('today:get', core.today.get)
  handle('today:check', (planDate, productId, slot, action) => core.today.check(planDate, productId, slot, action))
  handle('today:undo', (planDate, productId, slot) => core.today.undo(planDate, productId, slot))
  handle('today:record-event', (planDate, event, time) => core.today.recordEvent(planDate, event, time))
  handle('today:clear-event', (planDate, event) => core.today.clearEvent(planDate, event))
  handle('today:skip-event', (planDate, meal) => core.today.skipEvent(planDate, meal))

  handle('stats:get', (days) => core.stats.get(days))
  handle('search:supplements', (name, manufacturer) => core.search.supplements(name, manufacturer))
}
