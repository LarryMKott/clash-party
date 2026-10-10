import React, { memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  connections: IMihomoConnectionDetail[]
  /** 连接 id → 当前速率（字节/秒） */
  speeds: Map<string, number>
}

const MAX_DOTS = 72

// 稳定散列：同一连接固定方位角
function hashAngle(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 3600) / 10
}

function speedColor(bps: number): string {
  if (bps > 5 * 1024 * 1024) return '#f87171'
  if (bps > 1024 * 1024) return '#fbbf24'
  if (bps > 64 * 1024) return '#34d399'
  return '#60a5fa'
}

const ConnectionRadarBase: React.FC<Props> = ({ connections, speeds }) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dataRef = useRef({ connections, speeds })
  dataRef.current = { connections, speeds }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    let raf = 0
    let sweep = 0

    const resize = (): void => {
      const size = canvas.clientWidth
      if (!size) return
      canvas.width = size * dpr
      canvas.height = size * dpr
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const size = canvas.clientWidth
      if (!size) return
      const { connections: conns, speeds: spd } = dataRef.current
      const w = canvas.width / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, w)

      const cx = w / 2
      const cy = w / 2
      const radius = w / 2 - 10

      // 刻度环与十字线
      ctx.strokeStyle = 'rgba(96,160,255,0.22)'
      ctx.lineWidth = 1
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath()
        ctx.arc(cx, cy, (radius * i) / 4, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(cx - radius, cy)
      ctx.lineTo(cx + radius, cy)
      ctx.moveTo(cx, cy - radius)
      ctx.lineTo(cx, cy + radius)
      ctx.stroke()

      // 旋转扫描扇形
      sweep = (sweep + 0.02) % (Math.PI * 2)
      const gradient = ctx.createConicGradient ? ctx.createConicGradient(sweep - 0.9, cx, cy) : null
      if (gradient) {
        gradient.addColorStop(0, 'rgba(96,160,255,0.28)')
        gradient.addColorStop(0.12, 'rgba(96,160,255,0)')
        gradient.addColorStop(1, 'rgba(96,160,255,0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = 'rgba(125,211,252,0.7)'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(sweep) * radius, cy + Math.sin(sweep) * radius)
      ctx.stroke()

      // 连接光点：新连接靠外、随存活时间向内收缩，亮度随速率呼吸
      const time = now / 1000
      const list = conns.slice(0, MAX_DOTS)
      const nowMs = Date.now()
      for (let i = 0; i < list.length; i++) {
        const conn = list[i]
        const angle = (hashAngle(conn.id) * Math.PI) / 180
        const ageSec = Math.max(0, (nowMs - new Date(conn.start).getTime()) / 1000)
        const ageFactor = 1 - Math.exp(-ageSec / 240)
        const r = radius * (0.92 - 0.68 * ageFactor)
        const bps = spd.get(conn.id) ?? 0
        const twinkle = 0.55 + 0.45 * Math.sin(time * (2 + (bps > 102400 ? 6 : 2)) + i)
        const size = 1.5 + Math.min(2.5, Math.log10(1 + bps) / 2.2)
        ctx.globalAlpha = Math.min(1, twinkle + (bps > 0 ? 0.25 : 0))
        ctx.fillStyle = speedColor(bps)
        ctx.beginPath()
        ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // 中心计数
      ctx.fillStyle = 'rgba(190,215,255,0.9)'
      ctx.font = `600 ${Math.max(12, w * 0.05)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(conns.length), cx, cy)
    }
    raf = requestAnimationFrame(draw)
    return (): void => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <span className="text-[11px] tracking-[0.25em] text-foreground/45">{t('warroom.radar')}</span>
      <canvas ref={canvasRef} className="aspect-square w-full max-w-[280px] flex-1" />
      <span className="text-[11px] text-foreground/40">{t('warroom.connections')}</span>
    </div>
  )
}

const ConnectionRadar = memo(ConnectionRadarBase)
ConnectionRadar.displayName = 'ConnectionRadar'

export default ConnectionRadar
