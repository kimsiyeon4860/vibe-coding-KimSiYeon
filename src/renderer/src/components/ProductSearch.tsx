import { useState, type KeyboardEvent } from 'react'
import type { PublicProduct } from '../../../shared/publicData'

interface Props {
  /** 결과 하나를 고르면 입력 창을 채운다 */
  onPick: (product: PublicProduct) => void
}

// 식품안전나라(공공데이터) 건강기능식품 검색. 결과가 없으면 직접 입력한다.
export default function ProductSearch({ onPick }: Props) {
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [searching, setSearching] = useState(false)
  const [items, setItems] = useState<PublicProduct[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<string | null>(null)

  const search = async () => {
    if (!name.trim()) {
      setError('제품명을 입력해 주세요')
      return
    }
    setSearching(true)
    setError('')
    try {
      const result = await window.api.search.supplements(name, manufacturer)
      if (result.ok) {
        setItems(result.items)
        setTotal(result.total)
      } else {
        setItems(null)
        setError(result.error)
      }
    } finally {
      setSearching(false)
    }
  }

  // 바깥 입력 창(form)이 제출되지 않도록 Enter를 여기서 처리
  const onEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void search()
  }

  const inputClass =
    'rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'

  return (
    <section aria-label="제품 검색" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-medium">제품 검색 (식품안전나라)</p>
      <div className="mt-2 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onEnter}
          placeholder="제품명 (예: 알티지 오메가3)"
          aria-label="검색할 제품명"
          className={`${inputClass} flex-[2]`}
        />
        <input
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          onKeyDown={onEnter}
          placeholder="제조사 (선택)"
          aria-label="검색할 제조사"
          className={`${inputClass} flex-1`}
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching}
          className="shrink-0 rounded-lg bg-slate-700 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {searching ? '검색 중…' : '검색'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {items !== null && items.length === 0 && (
        <p className="mt-2 text-sm text-slate-600">
          검색 결과가 없습니다. 해외 직구 제품 등은 등록되어 있지 않을 수 있으니 아래에 직접 입력해 주세요.
        </p>
      )}

      {items !== null && items.length > 0 && (
        <>
          <p className="mt-2 text-xs text-slate-500">
            {total > items.length ? `${total}건 중 ${items.length}건 — 더 정확히 찾으려면 제조사도 입력하세요` : `${items.length}건`}
          </p>
          <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
            {items.map((p) => (
              <li key={p.reportNo || `${p.name}-${p.manufacturer}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(p.reportNo || p.name)
                    onPick(p)
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm hover:border-indigo-400 hover:bg-white ${
                    picked === (p.reportNo || p.name) ? 'border-indigo-500 bg-white' : 'border-slate-200'
                  }`}
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{p.manufacturer}</span>
                  {p.primaryFunction && <span className="block truncate text-xs text-slate-500">{p.primaryFunction}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
