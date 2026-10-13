import React, { memo, useEffect, useRef } from 'react'

interface Props {
  up: number
  down: number
}

const WINDOW = 60

// 顶栏速率波形迷你图：最近 60 个采样的上下行双线波形
const RateSparklineBase: React.FC<Props> = ({ up, down }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bufferRef = useRef<{ up: number[]; down: number[] }>({ up: [], down: [] })

  useEffect(() => {
    const buf = bufferRef.current
    buf.up.push(up)
    buf.down.push(down)
    if (buf.up.length > WINDOW) buf.up.shift()
    if (buf.down.length > WINDOW) buf.down.shift()

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const max = Math.max(1024, ...buf.up, ...buf.down)
    const drawSeries = (series: number[], color: string): void => {
      if (series.length < 2) return
      const step = w / (WINDOW - 1)
      const offset = WINDOW - series.length
      ctx.beginPath()
      series.forEach((v, i) => {
        const x = (offset + i) * step
        const y = h - 2 - (v / max) * (h - 6)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.shadowColor = color
      ctx.shadowBlur = 5
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    drawSeries(buf.down, 'rgba(96,165,250,0.9)')
    drawSeries(buf.up, 'rgba(52,211,153,0.9)')
  }, [up, down])

  return <canvas ref={canvasRef} className="h-9 w-44" />
}

const RateSparkline = memo(RateSparklineBase)
RateSparkline.displayName = 'RateSparkline'

export default RateSparkline
