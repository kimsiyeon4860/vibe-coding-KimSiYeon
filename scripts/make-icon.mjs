// 설치 파일·바로가기용 앱 아이콘(build/icon.png, 256×256)을 만든다. 실행: npm run icon
// 트레이 아이콘(src/main/trayIcon.ts)과 같은 대각선 캡슐 그림을 크게 그린다. Node 내장 기능만 사용.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const SIZE = 256
const SCALE = SIZE / 32
// 32px 트레이 아이콘의 좌표를 확대
const [ax, ay, bx, by, r] = [8.5, 23.5, 23.5, 8.5, 7.5].map((v) => v * SCALE)
const RED = [0xef, 0x44, 0x44]
const YELLOW = [0xfb, 0xbf, 0x24]

const pixels = Buffer.alloc(SIZE * SIZE * 4) // R, G, B, A
const dx = bx - ax
const dy = by - ay
const seg = dx * dx + dy * dy
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5
    const py = y + 0.5
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / seg))
    const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    const alpha = Math.max(0, Math.min(1, r + 0.5 - dist))
    if (alpha === 0) continue
    // 가운데 이음선은 살짝 어둡게
    const seam = Math.abs(t - 0.5) * Math.sqrt(seg) < SCALE * 0.6
    const color = (t < 0.5 ? RED : YELLOW).map((c) => (seam ? Math.round(c * 0.8) : c))
    const i = (y * SIZE + x) * 4
    pixels.set([...color, Math.round(255 * alpha)], i)
  }
}

// PNG: 행마다 필터 바이트(0) + RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)

const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header.set([8, 6, 0, 0, 0], 8) // 8비트, RGBA, 기본 압축·필터, 비월 없음

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`아이콘 저장: ${out} (${png.length} bytes)`)
