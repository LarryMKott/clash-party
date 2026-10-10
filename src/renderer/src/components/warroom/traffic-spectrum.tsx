import React, { memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  /** 连接 id → 当前速率（字节/秒） */
  speeds: Map<string, number>
}

const BARS = 36

const TrafficSpectrumBase: React.FC<Props> = ({ speeds }) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const speedsRef = useRef(speeds)
  speedsRef.current = speeds

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    let raf = 0
    // 当前柱高（0-1），向目标值缓动，形成呼吸感
    const heights = new Array<number>(BARS).fill(0)

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      if (!w || !h) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // 目标高度：按速率降序铺满柱位，其余柱位保持噪声底
      const sorted = Array.from(speedsRef.current.values()).sort((a, b) => b - a)
      const max = Math.max(sorted[0] ?? 0, 1024 * 64)
      for (let i = 0; i < BARS; i++) {
        let target: number
        if (i < sorted.length) {
          target = Math.max(0.06, Math.min(1, sorted[i] / max))
        } else {
          // 空闲柱位：微弱噪声底，随时间起伏
          target = 0.03 + 0.02 * Math.abs(Math.sin(now / 900 + i * 0.7))
        }
        heights[i] += (target - heights[i]) * 0.16
      }

      const gap = 3
      const barW = (w - gap * (BARS - 1)) / BARS
      for (let i = 0; i < BARS; i++) {
        const barH = Math.max(2, heights[i] * (h - 6))
        const x = i * (barW + gap)
        const grad = ctx.createLinearGradient(0, h, 0, h - barH)
        const ratio = heights[i]
        if (ratio > 0.75) {
          grad.addColorStop(0, 'rgba(59,130,246,0.85)')
          grad.addColorStop(1, 'rgba(248,113,113,0.95)')
        } else if (ratio > 0.4) {
          grad.addColorStop(0, 'rgba(59,130,246,0.8)')
          grad.addColorStop(1, 'rgba(52,211,153,0.9)')
        } else {
          grad.addColorStop(0, 'rgba(59,130,246,0.6)')
          grad.addColorStop(1, 'rgba(125,211,252,0.85)')
        }
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(x, h - barH, barW, barH, 2)
        ctx.fill()
        // 顶端亮点
        ctx.fillStyle = 'rgba(190,225,255,0.9)'
        ctx.fillRect(x, h - barH - 1, barW, 1.5)
      }
    }
    raf = requestAnimationFrame(draw)
    return (): void => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <span className="text-[11px] tracking-[0.25em] text-foreground/45">
        {t('warroom.spectrum')}
      </span>
      <canvas ref={canvasRef} className="min-h-0 w-full flex-1" />
    </div>
  )
}

const TrafficSpectrum = memo(TrafficSpectrumBase)
TrafficSpectrum.displayName = 'TrafficSpectrum'

export default TrafficSpectrum
