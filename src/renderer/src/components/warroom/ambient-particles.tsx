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

const COUNT = 64

// 环境粒子层：低密度星尘缓缓上升，流速与亮度随实时总流量增强，
// 高流量时部分粒子拉出短拖尾。纯装饰，pointer-events-none。
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

    let last = performance.now()
    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!w || !h) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const rate = rateRef.current
      // 流量 → 速度/亮度系数：空闲 1.0，狂飙 ~4x
      const energy = 1 + Math.log10(1 + rate) / 1.6
      const time = now / 1000

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
          // 高流量拖尾：短竖线
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
