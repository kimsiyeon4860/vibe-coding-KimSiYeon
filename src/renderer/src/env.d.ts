import type { PillMateApi } from '../../shared/types'

declare global {
  interface Window {
    /** preload에서 노출한 메인 프로세스 기능 */
    api: PillMateApi
  }
}
