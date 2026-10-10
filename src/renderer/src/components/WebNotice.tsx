import { useState } from 'react'

// 웹판 오늘 탭 위 안내: 알림이 꺼져 있으면 켜도록, 탭을 열어 두도록
export default function WebNotice() {
  const web = window.api.web
  const [status, setStatus] = useState(() => web?.notificationStatus() ?? 'unsupported')
  if (!web) return null

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
      <p>
        🔔 <b>이 탭을 열어 두면</b> 복용 시간에 알람이 울려요. 데이터는 이 브라우저에만 저장됩니다.
      </p>
      {status === 'default' && (
        <button
          type="button"
          onClick={() => void web.enableNotifications().then(setStatus)}
          className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
        >
          알림·소리 켜기 (다른 창을 보고 있어도 알려 드려요)
        </button>
      )}
      {status === 'denied' && (
        <p className="mt-1 text-xs">
          브라우저 알림이 차단되어 있어요. 주소창 왼쪽 자물쇠 아이콘 → 알림 → 허용으로 바꾸면 다른 창을 볼 때도 알려 드려요.
        </p>
      )}
    </div>
  )
}
