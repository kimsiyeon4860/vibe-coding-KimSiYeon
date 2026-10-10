// Windows 시작 시 자동 실행 (트레이에만 뜨도록 --minimized). 설정 탭에서 켜고 끈다.
import { app } from 'electron'

/**
 * 개발 모드(npm run dev)에서는 개발용 Electron이 시작프로그램에 등록되므로 건너뛴다.
 * 설치한 앱은 실행될 때마다 설정값으로 다시 맞춘다 (설치 위치가 바뀌어도 올바른 경로로 등록).
 */
export function applyAutoLaunch(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--minimized'] })
}
