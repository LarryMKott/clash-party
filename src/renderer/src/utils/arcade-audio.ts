// 测速音游的合成音效：WebAudio 现场生成，无音频素材。
// 开关存 localStorage（'arcade-sound'），结算面板里可切换。

const KEY = 'arcade-sound'

export function isArcadeSoundEnabled(): boolean {
  return localStorage.getItem(KEY) !== '0'
}

export function setArcadeSoundEnabled(enabled: boolean): void {
  localStorage.setItem(KEY, enabled ? '1' : '0')
}

let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (!isArcadeSoundEnabled()) return null
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gainValue: number,
  delay = 0,
  slideTo?: number
): void {
  const ac = audioContext()
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  const start = ac.currentTime + delay
  osc.frequency.setValueAtTime(freq, start)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration)
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

// 命中：音高随连击爬升，越连越高亢
export function playHit(combo: number): void {
  const step = Math.min(combo, 24)
  tone(520 + step * 36, 0.09, 'square', 0.06)
}

// 失手：低哑短促
export function playMiss(): void {
  tone(150, 0.18, 'sawtooth', 0.07, 0, 90)
}

// 结算：评级越高音越华丽
export function playSettle(rating: string): void {
  if (rating === 'S') {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, i * 0.09))
  } else if (rating === 'A') {
    ;[523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, i * 0.09))
  } else {
    tone(440, 0.2, 'triangle', 0.06)
  }
}
