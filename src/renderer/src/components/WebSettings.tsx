import { useEffect, useRef, useState } from 'react'
import type { NotificationStatus, WebOnlyApi } from '../../../shared/types'

const STATUS_TEXT: Record<NotificationStatus, string> = {
  granted: '켜짐',
  default: '아직 허용 안 함',
  denied: '차단됨 — 브라우저 주소창 왼쪽 자물쇠 아이콘 → 알림 → 허용으로 바꿔 주세요',
  unsupported: '이 브라우저는 알림을 지원하지 않아요'
}

// 웹판 설정: 알림 권한, 검색 API 키(이 브라우저에만), 데이터 백업
export default function WebSettings({ web }: { web: WebOnlyApi }) {
  const [status, setStatus] = useState<NotificationStatus>(web.notificationStatus())
  const [keys, setKeys] = useState({ foodSafety: '', dataGoKr: '' })
  const [keysSaved, setKeysSaved] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void web.getKeys().then(setKeys)
  }, [web])

  const download = async () => {
    const bytes = await web.exportBackup()
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `pillmate-backup-${new Date().toISOString().slice(0, 10)}.db`
    a.click()
    URL.revokeObjectURL(url)
    setBackupMessage('백업 파일을 내려받았어요.')
  }

  const restore = async (file: File) => {
    if (!window.confirm('지금 데이터를 백업 파일 내용으로 바꿉니다. 계속할까요?')) return
    const result = await web.importBackup(new Uint8Array(await file.arrayBuffer()))
    if (!result.ok) setBackupMessage(result.error)
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">알림·소리</h2>
        <p className="mt-1 text-sm text-slate-500">
          웹판은 <b>이 탭이 열려 있어야</b> 알람이 울립니다. 다른 창을 보고 있어도 알 수 있도록 브라우저 알림을 켜 두세요.
        </p>
        <p className="mt-2 text-sm">
          브라우저 알림: <b>{STATUS_TEXT[status]}</b>
        </p>
        <button
          type="button"
          onClick={() => void web.enableNotifications().then(setStatus)}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          알림·소리 켜기
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">제품 검색 API 키</h2>
        <p className="mt-1 text-xs text-slate-500">
          키는 <b>이 브라우저에만</b> 저장되고 다른 곳으로 보내지지 않습니다 (검색할 때 해당 공공기관 서버로만 전송).
        </p>
        <label className="mt-3 block text-sm">
          식품안전나라 (건강기능식품) — 비우면 공개 견본 키 <code>sample</code>(결과 최대 5건)
          <input
            value={keys.foodSafety}
            onChange={(e) => {
              setKeys({ ...keys, foodSafety: e.target.value })
              setKeysSaved(false)
            }}
            placeholder="sample"
            className={inputClass}
          />
        </label>
        <label className="mt-3 block text-sm">
          공공데이터포털 일반 인증키 (일반의약품) — 없으면 일반의약품은 검색되지 않아요
          <input
            value={keys.dataGoKr}
            onChange={(e) => {
              setKeys({ ...keys, dataGoKr: e.target.value })
              setKeysSaved(false)
            }}
            placeholder="공공데이터포털 마이페이지의 일반 인증키"
            className={inputClass}
          />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void web.setKeys(keys).then(() => setKeysSaved(true))}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            키 저장
          </button>
          {keysSaved && <span className="text-sm text-green-700">저장했습니다</span>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">데이터 백업</h2>
        <p className="mt-1 text-sm text-slate-500">
          모든 기록은 이 브라우저에만 저장됩니다. 브라우저의 사이트 데이터를 지우면 사라지니 가끔 백업해 두세요. 다른 PC로 옮길
          때도 씁니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void download()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            백업 파일 내려받기
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            백업 파일 불러오기
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".db"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void restore(file)
              e.target.value = ''
            }}
          />
        </div>
        {backupMessage && <p className="mt-2 text-sm text-slate-600">{backupMessage}</p>}
      </section>
    </>
  )
}
