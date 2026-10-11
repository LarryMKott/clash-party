import React, { memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  connections: IMihomoConnectionDetail[]
  /** 连接 id → 当前速率（字节/秒） */
  speeds: Map<string, number>
  /** 嵌入 PanelShell 时隐藏自带标题（默认 false） */
  compact?: boolean
}

const MAX_DOTS = 72
const BEARINGS = [
  { label: 'N', angle: -Math.PI / 2 },
  { label: 'E', angle: 0 },
  { label: 'S', angle: Math.PI / 2 },
  { label: 'W', angle: Math.PI }
]

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

function formatBps(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${Math.round(bps)} B/s`
}

interface Dot {
  x: number
  y: number
  size: number
  color: string
  bps: number
  host: string
  r: number
  angle: number
}

const ConnectionRadarBase: React.FC<Props> = ({ connections, speeds, compact = false }) => {
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

      // 距离环与十字线
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

      // 外圈方位刻度：每 6° 一格，每 30° 加长
      ctx.strokeStyle = 'rgba(125,211,252,0.5)'
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2
        const long = i % 5 === 0
        const inner = radius * (long ? 0.9 : 0.95)
        ctx.globalAlpha = long ? 0.7 : 0.3
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // 方位字母
      ctx.fillStyle = 'rgba(125,211,252,0.55)'
      ctx.font = `600 ${Math.max(8, w * 0.032)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const b of BEARINGS) {
        ctx.fillText(
          b.label,
          cx + Math.cos(b.angle) * (radius - w * 0.005),
          cy + Math.sin(b.angle) * (radius - w * 0.005)
        )
      }

      // 距离标尺（沿正上方方向）
      ctx.fillStyle = 'rgba(96,160,255,0.32)'
      ctx.font = `${Math.max(7, w * 0.026)}px sans-serif`
      ctx.textAlign = 'left'
      for (let i = 1; i <= 3; i++) {
        ctx.fillText(`${i * 25}`, cx + 3, cy - (radius * i) / 4)
      }

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
      const dots: Dot[] = []
      for (let i = 0; i < list.length; i++) {
        const conn = list[i]
        const angle = (hashAngle(conn.id) * Math.PI) / 180
        const ageSec = Math.max(0, (nowMs - new Date(conn.start).getTime()) / 1000)
        const ageFactor = 1 - Math.exp(-ageSec / 240)
        const r = radius * (0.92 - 0.68 * ageFactor)
        const bps = spd.get(conn.id) ?? 0
        dots.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          size: 1.5 + Math.min(2.5, Math.log10(1 + bps) / 2.2),
          color: speedColor(bps),
          bps,
          host: conn.metadata.host || conn.metadata.destinationIP || '',
          r,
          angle
        })
      }

      // 拖尾：沿径向向外的三段残影，越外越淡
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i]
        for (let k = 3; k >= 1; k--) {
          const rr = Math.min(radius, d.r + k * 3.4)
          ctx.globalAlpha = 0.1 * (4 - k) * (d.bps > 0 ? 1.4 : 0.6)
          ctx.fillStyle = d.color
          ctx.beginPath()
          ctx.arc(
            cx + Math.cos(d.angle) * rr,
            cy + Math.sin(d.angle) * rr,
            d.size * 0.7,
            0,
            Math.PI * 2
          )
          ctx.fill()
        }
      }
      ctx.globalCompositeOperation = 'source-over'

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i]
        const twinkle = 0.55 + 0.45 * Math.sin(time * (2 + (d.bps > 102400 ? 6 : 2)) + i)
        ctx.globalAlpha = Math.min(1, twinkle + (d.bps > 0 ? 0.25 : 0))
        ctx.fillStyle = d.color
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // 目标锁定：对当前速率最高的连接画锁定框与读数
      let focus = -1
      let focusBps = 0
      for (let i = 0; i < dots.length; i++) {
        if (dots[i].bps > focusBps) {
          focusBps = dots[i].bps
          focus = i
        }
      }
      if (focus >= 0 && focusBps > 32 * 1024) {
        const d = dots[focus]
        const half = d.size * 2.6 + 6
        ctx.strokeStyle = 'rgba(125,211,252,0.75)'
        ctx.lineWidth = 1
        const seg = half * 0.55
        const corners: [number, number, number, number][] = [
          [d.x - half, d.y - half, 1, 1],
          [d.x + half, d.y - half, -1, 1],
          [d.x - half, d.y + half, 1, -1],
          [d.x + half, d.y + half, -1, -1]
        ]
        for (const [ox, oy, sx, sy] of corners) {
          ctx.beginPath()
          ctx.moveTo(ox + sx * seg, oy)
          ctx.lineTo(ox, oy)
          ctx.lineTo(ox, oy + sy * seg)
          ctx.stroke()
        }
        // 引线 + 读数
        const labelX = Math.min(w - 4, d.x + half + 6)
        const labelY = Math.max(12, d.y - half - 4)
        ctx.beginPath()
        ctx.moveTo(d.x + half * 0.7, d.y - half * 0.7)
        ctx.lineTo(labelX, labelY)
        ctx.stroke()
        ctx.fillStyle = 'rgba(190,225,255,0.9)'
        ctx.font = `${Math.max(8, w * 0.028)}px sans-serif`
        ctx.textAlign = labelX > w * 0.6 ? 'right' : 'left'
        const textX = labelX > w * 0.6 ? w - 4 : labelX + 4
        ctx.fillText(formatBps(focusBps), textX, labelY)
        const host = d.host.length > 22 ? `${d.host.slice(0, 21)}…` : d.host
        if (host) {
          ctx.fillStyle = 'rgba(125,211,252,0.55)'
          ctx.fillText(host, textX, labelY + Math.max(10, w * 0.036))
        }
      }

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
    <div className="flex h-full min-h-0 w-full flex-col items-center gap-1">
      {!compact && (
        <span className="text-[11px] tracking-[0.25em] text-foreground/45">
          {t('warroom.radar')}
        </span>
      )}
      <canvas ref={canvasRef} className="aspect-square w-full max-w-[300px] shrink-0" />
      {!compact && (
        <span className="text-[11px] text-foreground/40">{t('warroom.connections')}</span>
      )}
    </div>
  )
}

const ConnectionRadar = memo(ConnectionRadarBase)
ConnectionRadar.displayName = 'ConnectionRadar'

export default ConnectionRadar
