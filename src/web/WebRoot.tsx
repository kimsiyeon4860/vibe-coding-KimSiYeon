import { useSyncExternalStore } from 'react'
import AlarmPopup from '../renderer/src/AlarmPopup'
import App from '../renderer/src/App'
import LifePrompt from '../renderer/src/LifePrompt'
import type { WebPlatform } from './platform'

// 웹판 최상위 화면: 앱 화면 위에 알람 창·기상/식사 확인 창을 겹쳐 띄운다 (데스크톱의 별도 창 대신)
export default function WebRoot({ platform }: { platform: WebPlatform }) {
  const overlay = useSyncExternalStore(platform.onOverlayChange, platform.getOverlay)

  return (
    <>
      <App />
      {(overlay.alarmOpen || overlay.prompt) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          {overlay.alarmOpen ? (
            <div role="alertdialog" aria-label="복용 알람" className="h-[400px] w-[420px] overflow-hidden rounded-xl shadow-2xl">
              <AlarmPopup />
            </div>
          ) : (
            <div
              role="dialog"
              aria-label="생활 기록 확인"
              key={`${overlay.prompt?.planDate}-${overlay.prompt?.event}`}
              className="h-[320px] w-[380px] overflow-hidden rounded-xl shadow-2xl"
            >
              <LifePrompt />
            </div>
          )}
        </div>
      )}
    </>
  )
}
