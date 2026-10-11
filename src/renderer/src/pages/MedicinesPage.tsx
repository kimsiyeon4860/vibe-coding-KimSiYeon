import { useState } from 'react'
import PrescriptionsPage from './PrescriptionsPage'
import SupplementsPage from './SupplementsPage'

// '내 약' 화면: 영양제 목록과 처방약 목록을 한 화면에 (화면 3개 이하 조건)
export default function MedicinesPage() {
  const [recommending, setRecommending] = useState(false)

  return (
    <div>
      <SupplementsPage onRecommendingChange={setRecommending} />
      {/* 추천 보드는 영양제만 다루므로, 보드를 연 동안에는 처방약 목록을 숨긴다 */}
      {!recommending && (
        <div className="border-t border-slate-200">
          <PrescriptionsPage />
        </div>
      )}
    </div>
  )
}
