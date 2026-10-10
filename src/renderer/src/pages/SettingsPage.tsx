// 설정 탭. 지금은 알람 테스트만 있고, 식사·기상·취침 시간 설정은 3단계에서 추가한다.
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">알람 테스트</h2>
        <p className="mt-1 text-sm text-slate-500">
          알람 창·알림·소리가 잘 나오는지 확인합니다. 창을 닫아도 앱은 작업표시줄 오른쪽 트레이에서 계속
          실행됩니다.
        </p>
        <button
          type="button"
          onClick={() => window.api.testAlarm()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
        >
          테스트 알람 울리기
        </button>
      </section>
    </div>
  )
}
