import React, { memo, useEffect, useRef } from 'react'

interface Props {
  /** 总速率（字节/秒），驱动粒子流速与亮度 */
  totalRate: number
}

interface Particle {
  x: number
  y: number
  size: number
  baseSpeed: number
  driftPhase: number
  driftFreq: number
  driftAmp: number
  alpha: number
}

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
}

interface Burst {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

const COUNT = 64
const SURGE_INTERVAL_MS = 5000

// 环境粒子层：星尘缓缓上升 + 随机流星 + 速率突增迸发。
// 流速与亮度随实时总流量增强。纯装饰，pointer-events-none。
const AmbientParticlesBase: React.FC<Props> = ({ totalRate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rateRef = useRef(totalRate)
  rateRef.current = totalRate

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let raf = 0
    let w = 0
    let h = 0

    const resize = (): void => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      if (!w || !h) return
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 0.6 + Math.random() * 1.8,
      baseSpeed: 7 + Math.random() * 18,
      driftPhase: Math.random() * Math.PI * 2,
      driftFreq: 0.15 + Math.random() * 0.4,
      driftAmp: 6 + Math.random() * 18,
      alpha: 0.14 + Math.random() * 0.3
    }))

    const meteors: Meteor[] = []
    let nextMeteorAt = performance.now() + 2200

    const bursts: Burst[] = []
    let smoothedRate = 0
    let lastSurgeAt = 0

    let last = performance.now()
    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!w || !h) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const rate = rateRef.current
      // 平滑速率用于突增检测
      smoothedRate += (rate - smoothedRate) * Math.min(1, dt * 1.2)
      const energy = 1 + Math.log10(1 + rate) / 1.6
      const time = now / 1000

      // ── 星尘 ─────────────────────────────────────────────
      for (const p of particles) {
        p.y -= (p.baseSpeed * energy * dt) / h
        if (p.y < -0.03) {
          p.y = 1.02
          p.x = Math.random()
        }
        const x = (p.x + Math.sin(time * p.driftFreq + p.driftPhase) * p.driftAmp) / w
        const px = x * w
        const py = p.y * h
        const twinkle = 0.7 + 0.3 * Math.sin(time * 1.7 + p.driftPhase * 3)
        const alpha = Math.min(0.85, p.alpha * twinkle * (0.75 + energy * 0.22))
        const speedTail = rate > 2 * 1024 * 1024 && p.size > 1.6
        ctx.globalAlpha = alpha
        ctx.fillStyle = '#9ecbff'
        if (speedTail) {
          ctx.strokeStyle = '#9ecbff'
          ctx.lineWidth = p.size * 0.7
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px, py + p.baseSpeed * energy * 0.06)
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(px, py, p.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ── 流星 ─────────────────────────────────────────────
      if (now >= nextMeteorAt) {
        const busyRate = rate > 2 * 1024 * 1024 ? 0.7 : 1
        nextMeteorAt = now + (3000 + Math.random() * 5200) * busyRate
        const fromLeft = Math.random() > 0.5
        meteors.push({
          x: (fromLeft ? 0.05 + Math.random() * 0.35 : 0.6 + Math.random() * 0.35) * w,
          y: (0.02 + Math.random() * 0.2) * h,
          vx: (fromLeft ? 1 : -1) * (260 + Math.random() * 240),
          vy: 150 + Math.random() * 120,
          life: 0,
          maxLife: 0.9 + Math.random() * 0.5
        })
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.life += dt
        if (m.life >= m.maxLife) {
          meteors.splice(i, 1)
          continue
        }
        m.x += m.vx * dt
        m.y += m.vy * dt
        const fade = Math.sin((m.life / m.maxLife) * Math.PI)
        const tail = 90 + m.maxLife * 60
        const norm = Math.hypot(m.vx, m.vy) || 1
        const nx = m.vx / norm
        const ny = m.vy / norm
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - nx * tail, m.y - ny * tail)
        grad.addColorStop(0, `rgba(214,236,255,${0.85 * fade})`)
        grad.addColorStop(1, 'rgba(214,236,255,0)')
        ctx.globalAlpha = 1
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(m.x - nx * tail, m.y - ny * tail)
        ctx.stroke()
        ctx.fillStyle = `rgba(240,250,255,${0.95 * fade})`
        ctx.beginPath()
        ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }

      // ── 速率突增迸发 ─────────────────────────────────────
      if (
        rate > 1.5 * 1024 * 1024 &&
        rate > smoothedRate * 1.55 &&
        now - lastSurgeAt > SURGE_INTERVAL_MS
      ) {
        lastSurgeAt = now
        const cx = (0.36 + Math.random() * 0.28) * w
        for (let i = 0; i < 16; i++) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5
          const speed = 260 + Math.random() * 320
          bursts.push({
            x: cx + (Math.random() - 0.5) * 60,
            y: h * 0.94,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0,
            maxLife: 0.8 + Math.random() * 0.4,
            size: 1.4 + Math.random() * 2
          })
        }
        bursts.push({ x: cx, y: h * 0.9, vx: 0, vy: 0, life: 0, maxLife: 0.5, size: 0 }) // 辉光标记
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]
        b.life += dt
        if (b.life >= b.maxLife) {
          bursts.splice(i, 1)
          continue
        }
        const fade = 1 - b.life / b.maxLife
        if (b.size === 0) {
          // 中央辉光
          const r = 60 + b.life * 260
          const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r)
          grad.addColorStop(0, `rgba(147,197,253,${0.16 * fade})`)
          grad.addColorStop(1, 'rgba(147,197,253,0)')
          ctx.globalAlpha = 1
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.vy += 60 * dt
        ctx.globalAlpha = 0.9 * fade
        ctx.fillStyle = '#bfdbfe'
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)
    return (): void => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  return (
    <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[1] h-full w-full" />
  )
}

const AmbientParticles = memo(AmbientParticlesBase)
AmbientParticles.displayName = 'AmbientParticles'

export default AmbientParticles
