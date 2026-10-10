// 알림음: 음원 파일 없이 Web Audio로 3음 차임을 만든다 (프로토타입과 같은 음)
const NOTES: ReadonlyArray<[frequency: number, seconds: number]> = [
  [880, 0.14],
  [1175, 0.14],
  [1568, 0.26]
]

export function playChime(): void {
  const ctx = new AudioContext()
  let t = ctx.currentTime
  for (const [frequency, seconds] of NOTES) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    // 딸깍 소리가 나지 않게 짧게 커졌다 줄어들게
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.4, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + seconds)
    t += seconds
  }
  // 재생이 끝나면 오디오 장치 해제
  setTimeout(() => void ctx.close(), (t - ctx.currentTime) * 1000 + 200)
}
