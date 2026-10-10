// 처방약과 영양제를 함께 먹을 때 띄우는 안내. 상호작용 여부를 앱이 판단하지 않는다 (CLAUDE.md 원칙).
export default function PharmacistNotice() {
  return (
    <p role="note" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      💡 처방약과 영양제를 함께 드시고 있어요. <b>함께 먹어도 되는지 약사에게 확인하세요.</b>
    </p>
  )
}
