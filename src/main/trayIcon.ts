import { nativeImage, type NativeImage } from 'electron'

const SIZE = 32

/**
 * 알약 모양 아이콘을 코드로 그린다 (이미지 파일 불필요).
 * 왼쪽 아래는 빨강, 오른쪽 위는 노랑인 대각선 캡슐.
 */
export function createPillIcon(): NativeImage {
  // Windows 비트맵은 픽셀당 B, G, R, A 순서
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  const [ax, ay, bx, by, r] = [8.5, 23.5, 23.5, 8.5, 7.5]
  const dx = bx - ax
  const dy = by - ay
  const seg = dx * dx + dy * dy

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x + 0.5
      const py = y + 0.5
      // 캡슐 중심선 위의 가장 가까운 점까지의 거리
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / seg))
      const cx = ax + t * dx
      const cy = ay + t * dy
      const dist = Math.hypot(px - cx, py - cy)
      // 가장자리를 1px 부드럽게
      const alpha = Math.max(0, Math.min(1, r + 0.5 - dist))
      if (alpha === 0) continue

      const [red, green, blue] = t < 0.5 ? [0xef, 0x44, 0x44] : [0xfb, 0xbf, 0x24]
      const i = (y * SIZE + x) * 4
      // 반투명 픽셀은 색상에 알파를 곱해 둔다 (premultiplied)
      buf[i] = Math.round(blue * alpha)
      buf[i + 1] = Math.round(green * alpha)
      buf[i + 2] = Math.round(red * alpha)
      buf[i + 3] = Math.round(255 * alpha)
    }
  }
  return nativeImage.createFromBitmap(buf, { width: SIZE, height: SIZE })
}
