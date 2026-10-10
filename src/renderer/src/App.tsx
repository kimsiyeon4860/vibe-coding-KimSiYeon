// 메인 창. 1단계에서는 테스트 알람 버튼만 있다.
export default function App() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 bg-slate-50 p-8 text-slate-800">
      <h1 className="text-3xl font-bold">💊 PillMate</h1>
      <p className="text-center text-slate-500">
        알람이 확실히 뜨는지 먼저 확인해 보세요.
        <br />
        창을 닫아도 앱은 작업표시줄 오른쪽 트레이에서 계속 실행됩니다.
      </p>
      <button
        type="button"
        onClick={() => window.api.testAlarm()}
        className="rounded-xl bg-indigo-600 px-6 py-3 text-lg font-semibold text-white shadow hover:bg-indigo-700 active:bg-indigo-800"
      >
        테스트 알람 울리기
      </button>
    </main>
  )
}
