// 웹: DB 파일(바이트)을 브라우저 IndexedDB에 저장하고, API 키처럼 작은 값은 localStorage에 둔다.
// 둘 다 이 브라우저에만 남는다 (다른 PC·브라우저와 공유되지 않음, 사이트 데이터를 지우면 사라짐).

const IDB_NAME = 'pillmate'
const STORE = 'files'
const DB_FILE_KEY = 'pillmate.db'

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadDbFile(): Promise<Uint8Array | null> {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const request = idb.transaction(STORE, 'readonly').objectStore(STORE).get(DB_FILE_KEY)
    request.onsuccess = () => resolve(request.result instanceof Uint8Array ? request.result : null)
    request.onerror = () => reject(request.error)
  })
}

export async function saveDbFile(bytes: Uint8Array): Promise<void> {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(bytes, DB_FILE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---------------------------------------------------------------- API 키 (이 브라우저에만)

export interface SearchKeys {
  foodSafety: string
  dataGoKr: string
}

const KEYS_STORAGE = 'pillmate.searchKeys'
/** 식품안전나라가 누구나 쓰도록 공개한 견본 키 (검색 결과 최대 5건) */
export const SAMPLE_FOOD_SAFETY_KEY = 'sample'

export function loadSearchKeys(): SearchKeys {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS_STORAGE) ?? '{}') as Partial<SearchKeys>
    return { foodSafety: raw.foodSafety || SAMPLE_FOOD_SAFETY_KEY, dataGoKr: raw.dataGoKr ?? '' }
  } catch {
    return { foodSafety: SAMPLE_FOOD_SAFETY_KEY, dataGoKr: '' }
  }
}

export function saveSearchKeys(keys: SearchKeys): void {
  try {
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys))
  } catch {
    // 저장소를 쓸 수 없는 환경(비공개 창 등)에서는 이번 방문 동안만 유지된다
  }
}
